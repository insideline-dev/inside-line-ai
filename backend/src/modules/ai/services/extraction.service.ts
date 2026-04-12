import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { eq } from "drizzle-orm";
import { DrizzleService } from "../../../database";
import { StorageService } from "../../../storage";
import { startup, type Startup } from "../../startup/entities";
import {
  type ExtractionResult,
  type StartupFileReference,
  type StartupFormContext,
  type StartupTeamMemberReference,
} from "../interfaces/phase-results.interface";
import type { PhaseProgressCallback } from "../interfaces/progress-callback.interface";
import { ExtractionSchema } from "../schemas";
import { FieldExtractorService, type ExtractedFields } from "./field-extractor.service";
import { PdfOcrService } from "./pdf-ocr.service";
import { PdfTextExtractorService } from "./pdf-text-extractor.service";
import { ExcelTextExtractorService } from "./excel-text-extractor.service";
import { PptxTextExtractorService } from "./pptx-text-extractor.service";

type SupportingDocumentExtraction = {
  combinedText: string;
  candidateCount: number;
  parsedCount: number;
  warnings: string[];
};

@Injectable()
export class ExtractionService {
  private readonly logger = new Logger(ExtractionService.name);
  private readonly maxTextChars: number;
  private readonly maxPdfBytes: number;
  private readonly fetchTimeoutMs: number;
  private readonly extractionCache = new Map<
    string,
    { result: ExtractionResult; ts: number }
  >();
  private static readonly CACHE_TTL_MS = 5 * 60 * 1000;

  cacheResult(startupId: string, result: ExtractionResult): void {
    this.extractionCache.set(startupId, { result, ts: Date.now() });
  }

  getCachedResult(startupId: string): ExtractionResult | null {
    const cached = this.extractionCache.get(startupId);
    if (!cached) {
      return null;
    }
    if (Date.now() - cached.ts >= ExtractionService.CACHE_TTL_MS) {
      this.extractionCache.delete(startupId);
      return null;
    }
    return cached.result;
  }

  clearExtractionCache(startupId: string): void {
    this.extractionCache.delete(startupId);
  }

  constructor(
    private config: ConfigService,
    private drizzle: DrizzleService,
    private storage: StorageService,
    private pdfTextExtractor: PdfTextExtractorService,
    private pptxTextExtractor: PptxTextExtractorService,
    private excelTextExtractor: ExcelTextExtractorService,
    private pdfOcr: PdfOcrService,
    private fieldExtractor: FieldExtractorService,
  ) {
    this.maxTextChars = this.config.get<number>(
      "AI_EXTRACTION_MAX_TEXT_CHARS",
      180_000,
    );
    this.maxPdfBytes = this.config.get<number>(
      "AI_EXTRACTION_MAX_PDF_BYTES",
      100 * 1024 * 1024,
    );
    this.fetchTimeoutMs = this.config.get<number>(
      "WEBSITE_SCRAPE_TIMEOUT_MS",
      30_000,
    );
  }

  async run(
    startupId: string,
    progress?: PhaseProgressCallback,
  ): Promise<ExtractionResult> {
    const cached = this.extractionCache.get(startupId);
    if (cached && Date.now() - cached.ts < ExtractionService.CACHE_TTL_MS) {
      this.logger.log(
        `[Extraction] Using cached extraction for startup ${startupId} (age=${Math.round((Date.now() - cached.ts) / 1000)}s)`,
      );
      progress?.onStepStart?.("extraction-cached", {});
      progress?.onStepComplete?.("extraction-cached", {
        summary: { cached: true, source: "pre-pipeline" },
      });
      return cached.result;
    }

    this.logger.log(`[Extraction] Starting extraction phase for startup ${startupId}`);

    const [record] = await this.drizzle.db
      .select()
      .from(startup)
      .where(eq(startup.id, startupId))
      .limit(1);

    if (!record) {
      throw new Error(`Startup ${startupId} not found`);
    }

    await this.classifyAndSetPitchDeck(record);

    const warnings: string[] = [];
    const startupContext = this.mapStartupContext(record);
    const fallbackText = this.buildSummary(record, startupContext);
    const startupContextCoverage = this.summarizeStartupContext(startupContext);
    this.logger.debug(
      `[Extraction] Startup context loaded | pitchDeckPath=${Boolean(record.pitchDeckPath)} | pitchDeckUrl=${Boolean(record.pitchDeckUrl)} | teamMembers=${record.teamMembers?.length ?? 0} | files=${record.files?.length ?? 0}`,
    );
    this.logger.debug(
      `[Extraction] Startup context coverage | present=${startupContextCoverage.presentCount}/${startupContextCoverage.totalCount} | missing=${startupContextCoverage.missingCount} | missingKeys=${startupContextCoverage.missingKeys.length > 0 ? startupContextCoverage.missingKeys.join(",") : "none"}`,
    );
    const supportingDocs = await this.extractSupportingDocuments(record, progress);
    warnings.push(...supportingDocs.warnings);
    if (supportingDocs.candidateCount > 0) {
      this.logger.log(
        `[Extraction] Supporting docs parsed | candidates=${supportingDocs.candidateCount} | parsed=${supportingDocs.parsedCount} | chars=${supportingDocs.combinedText.length}`,
      );
    }

    if (!record.pitchDeckPath && !record.pitchDeckUrl) {
      warnings.push("No pitch deck found; using startup form data only");
      this.logger.warn(
        `[Extraction] No deck source found for startup ${startupId}; using startup context fallback`,
      );
      if (supportingDocs.combinedText) {
        const enrichedFallbackText = this.mergeExtractionTexts(
          supportingDocs.combinedText,
          fallbackText,
        );
        this.logger.warn(
          `[Extraction] No deck source for startup ${startupId}; using supporting documents + startup context fallback`,
        );
        const fallbackFields = await this.fieldExtractor.extractFields(
          enrichedFallbackText,
          record,
        );
        const fallbackResult = this.buildResult(
          record,
          fallbackFields,
          enrichedFallbackText,
          startupContext,
          "startup-context",
          0,
          warnings,
        );
        this.logger.log(
          `[Extraction] Completed extraction phase for startup ${startupId} | source=startup-context | pageCount=0 | warnings=${fallbackResult.warnings?.length ?? 0}`,
        );
        return fallbackResult;
      }
      this.logger.warn(
        `[Extraction] Startup-context fallback detail | startup=${startupId} | fallbackSummaryChars=${fallbackText.length} | missingStartupContextKeys=${startupContextCoverage.missingKeys.length > 0 ? startupContextCoverage.missingKeys.join(",") : "none"}`,
      );
      const fallbackResult = this.buildResult(
        record,
        {},
        fallbackText,
        startupContext,
        "startup-context",
        0,
        warnings,
      );
      this.logger.log(
        `[Extraction] Completed extraction phase for startup ${startupId} | source=startup-context | pageCount=0 | warnings=${fallbackResult.warnings?.length ?? 0}`,
      );
      return fallbackResult;
    }

    let deckUrl: string | null = null;
    let deckBuffer: Buffer | null = null;
    let deckSource: "storage" | "url" | null = null;
    progress?.onStepStart("pdf_fetch", {
      inputJson: {
        pitchDeckPath: record.pitchDeckPath ?? null,
        pitchDeckUrl: record.pitchDeckUrl ?? null,
      },
    });

    if (record.pitchDeckPath) {
      try {
        this.logger.log(
          `[Extraction] Attempting deck fetch from storage path ${record.pitchDeckPath}`,
        );
        deckUrl = await this.storage.getDownloadUrl(record.pitchDeckPath, 900);
        this.logger.debug(
          `[Extraction] Generated signed deck URL ${this.redactUrl(deckUrl)}`,
        );
        deckBuffer = await this.fetchPdfBuffer(deckUrl);
        deckSource = "storage";
        this.logger.debug(
          `[Extraction] Downloaded PDF from pitchDeckPath | bytes=${deckBuffer.byteLength}`,
        );
      } catch (error) {
        const message = this.asMessage(error);
        warnings.push(`Unable to load PDF from pitchDeckPath: ${message}`);
        this.logger.warn(
          `[Extraction] Failed to load deck from pitchDeckPath ${record.pitchDeckPath}: ${message}`,
        );
      }
    }

    if (!deckBuffer && record.pitchDeckUrl) {
      try {
        this.logger.log(
          `[Extraction] Attempting deck fetch from direct URL ${this.redactUrl(record.pitchDeckUrl)}`,
        );
        deckUrl = record.pitchDeckUrl;
        deckBuffer = await this.fetchPdfBuffer(record.pitchDeckUrl);
        deckSource = "url";
        this.logger.debug(
          `[Extraction] Downloaded PDF from pitchDeckUrl | bytes=${deckBuffer.byteLength}`,
        );
      } catch (error) {
        const message = this.asMessage(error);
        warnings.push(`Unable to load PDF from pitchDeckUrl: ${message}`);
        this.logger.warn(
          `[Extraction] Failed to load deck from pitchDeckUrl ${this.redactUrl(record.pitchDeckUrl)}: ${message}`,
        );
      }
    }

    if (!deckBuffer) {
      progress?.onStepFailed(
        "pdf_fetch",
        "Deck file unavailable after all fetch attempts",
        {
          outputJson: {
            warnings,
          },
        },
      );
      warnings.push("Deck file is unavailable; using startup form data only");
      this.logger.warn(
        `[Extraction] Deck unavailable after all fetch attempts for startup ${startupId}; using startup context fallback`,
      );
      if (supportingDocs.combinedText) {
        const enrichedFallbackText = this.mergeExtractionTexts(
          supportingDocs.combinedText,
          fallbackText,
        );
        this.logger.warn(
          `[Extraction] Deck unavailable for startup ${startupId}; using supporting documents + startup context fallback`,
        );
        const fallbackFields = await this.fieldExtractor.extractFields(
          enrichedFallbackText,
          record,
        );
        const fallbackResult = this.buildResult(
          record,
          fallbackFields,
          enrichedFallbackText,
          startupContext,
          "startup-context",
          0,
          warnings,
        );
        this.logger.log(
          `[Extraction] Completed extraction phase for startup ${startupId} | source=startup-context | pageCount=0 | warnings=${fallbackResult.warnings?.length ?? 0}`,
        );
        return fallbackResult;
      }
      const fallbackResult = this.buildResult(
        record,
        {},
        fallbackText,
        startupContext,
        "startup-context",
        0,
        warnings,
      );
      this.logger.log(
        `[Extraction] Completed extraction phase for startup ${startupId} | source=startup-context | pageCount=0 | warnings=${fallbackResult.warnings?.length ?? 0}`,
      );
      return fallbackResult;
    }
    progress?.onStepComplete("pdf_fetch", {
      summary: {
        source: deckSource ?? "unknown",
        bytes: deckBuffer.byteLength,
      },
      outputJson: {
        source: deckSource ?? "unknown",
        bytes: deckBuffer.byteLength,
        deckUrl,
      },
    });

    let source: ExtractionResult["source"] = "startup-context";
    let extractedText = "";
    let pageCount = 0;
    let ocrAttempted = false;
    let ocrFailureMessage: string | undefined;
    const isPptx = this.isDeckPptx(record);
    const extractionMethod = isPptx ? "pptx-parse" : "pdf-parse";

    progress?.onStepStart("text_extraction", {
      inputJson: {
        method: extractionMethod,
        bytes: deckBuffer.byteLength,
      },
    });
    try {
      if (isPptx) {
        this.logger.log(`[Extraction] Running PPTX text extraction for startup ${startupId}`);
        const pptxResult = await this.pptxTextExtractor.extractText(deckBuffer);
        pageCount = pptxResult.pageCount;

        if (pptxResult.hasContent && !pptxResult.hasSparsePages) {
          extractedText = pptxResult.text;
          source = "pptx-parse";
          this.logger.log(
            `[Extraction] pptx-parse succeeded | slides=${pptxResult.pageCount} | chars=${pptxResult.text.length}`,
          );
          progress?.onStepComplete("text_extraction", {
            summary: {
              method: "pptx-parse",
              slides: pptxResult.pageCount,
              chars: pptxResult.text.length,
            },
            outputText: pptxResult.text,
            outputJson: {
              method: "pptx-parse",
              text: pptxResult.text,
              hasContent: pptxResult.hasContent,
            },
          });
        } else if (pptxResult.hasContent && pptxResult.hasSparsePages) {
          warnings.push(
            `PPTX has ${pptxResult.sparsePageCount} sparse slide(s) of ${pptxResult.pageCount}; switching to OCR for full coverage`,
          );
          this.logger.warn(
            `[Extraction] pptx-parse detected ${pptxResult.sparsePageCount}/${pptxResult.pageCount} sparse slides; routing to OCR`,
          );
          progress?.onStepComplete("text_extraction", {
            summary: {
              method: "pptx-parse",
              slides: pptxResult.pageCount,
              fallbackRequired: true,
              reason: "sparse_slides",
            },
            outputJson: {
              method: "pptx-parse",
              hasContent: pptxResult.hasContent,
              hasSparsePages: pptxResult.hasSparsePages,
              sparsePageCount: pptxResult.sparsePageCount,
              pageCount: pptxResult.pageCount,
            },
          });
        } else {
          warnings.push("PPTX text extraction returned sparse content; switching to OCR");
          this.logger.warn(
            `[Extraction] pptx-parse returned no usable text; switching to OCR`,
          );
          progress?.onStepComplete("text_extraction", {
            summary: {
              method: "pptx-parse",
              slides: pptxResult.pageCount,
              fallbackRequired: true,
              reason: "no_extractable_text",
            },
            outputJson: {
              method: "pptx-parse",
              hasContent: pptxResult.hasContent,
              textLength: pptxResult.text.length,
            },
          });
        }
      } else {
        this.logger.log(`[Extraction] Running pdf-parse text extraction for startup ${startupId}`);
        const pdfResult = await this.pdfTextExtractor.extractText(deckBuffer);
        pageCount = pdfResult.pageCount;

        if (pdfResult.hasContent && !pdfResult.hasSparsePages) {
          extractedText = pdfResult.text;
          source = "pdf-parse";
          this.logger.log(
            `[Extraction] pdf-parse succeeded | pages=${pdfResult.pageCount} | chars=${pdfResult.text.length}`,
          );
          progress?.onStepComplete("text_extraction", {
            summary: {
              method: "pdf-parse",
              pages: pdfResult.pageCount,
              chars: pdfResult.text.length,
            },
            outputText: pdfResult.text,
            outputJson: {
              method: "pdf-parse",
              pageCount: pdfResult.pageCount,
              text: pdfResult.text,
              hasContent: pdfResult.hasContent,
            },
          });
        } else if (pdfResult.hasContent && pdfResult.hasSparsePages) {
          warnings.push(
            `PDF has ${pdfResult.sparsePageCount} sparse page(s) of ${pdfResult.pageCount}; switching to OCR for full coverage`,
          );
          this.logger.warn(
            `[Extraction] pdf-parse detected ${pdfResult.sparsePageCount}/${pdfResult.pageCount} sparse pages; routing to OCR`,
          );
          progress?.onStepComplete("text_extraction", {
            summary: {
              method: "pdf-parse",
              pages: pdfResult.pageCount,
              fallbackRequired: true,
              reason: "sparse_pages",
            },
            outputJson: {
              method: "pdf-parse",
              hasContent: pdfResult.hasContent,
              hasSparsePages: pdfResult.hasSparsePages,
              sparsePageCount: pdfResult.sparsePageCount,
              pageCount: pdfResult.pageCount,
            },
          });
        } else {
          warnings.push("PDF appears scanned/image-only; switching to OCR");
          this.logger.warn(
            `[Extraction] pdf-parse returned no text | pages=${pdfResult.pageCount}; switching to OCR`,
          );
          progress?.onStepComplete("text_extraction", {
            summary: {
              method: "pdf-parse",
              pages: pdfResult.pageCount,
              fallbackRequired: true,
              reason: "no_extractable_text",
            },
            outputJson: {
              method: "pdf-parse",
              pageCount: pdfResult.pageCount,
              hasContent: pdfResult.hasContent,
              textLength: pdfResult.text.length,
            },
          });
        }
      }
    } catch (error) {
      const message = this.asMessage(error);
      warnings.push(`${extractionMethod} failed: ${message}`);
      this.logger.warn(`[Extraction] ${extractionMethod} failed: ${message}`);
      progress?.onStepComplete("text_extraction", {
        summary: {
          method: extractionMethod,
          fallbackRequired: true,
          reason: "parse_error",
        },
        outputJson: {
          error: message,
        },
      });
    }

    if (!extractedText && deckUrl) {
      ocrAttempted = true;
      progress?.onStepStart("ocr_fallback", {
        inputJson: {
          method: "ocr",
          deckUrl,
        },
      });
      try {
        this.logger.log(
          `[Extraction] Running OCR fallback for startup ${startupId} using ${this.redactUrl(deckUrl)}`,
        );
        const ocrResult = await this.pdfOcr.extractFromPdf(deckUrl);
        extractedText = ocrResult.text;
        pageCount = Math.max(pageCount, ocrResult.pages.length);
        source = "ocr";
        this.logger.log(
          `[Extraction] OCR succeeded | provider=${ocrResult.provider} | model=${ocrResult.model} | pages=${ocrResult.pages.length} | chars=${ocrResult.text.length}`,
        );
        progress?.onStepComplete("ocr_fallback", {
          summary: {
            method: "ocr",
            provider: ocrResult.provider,
            model: ocrResult.model,
            pages: ocrResult.pages.length,
            chars: ocrResult.text.length,
          },
          outputText: ocrResult.text,
          outputJson: ocrResult,
        });
      } catch (error) {
        const message = this.asMessage(error);
        ocrFailureMessage = message;
        warnings.push(`OCR failed: ${message}`);
        this.logger.warn(`[Extraction] OCR failed: ${message}`);
        progress?.onStepFailed("ocr_fallback", message, {
          outputJson: {
            error: message,
          },
        });
      }
    }

    if (!extractedText) {
      if (deckBuffer) {
        const errorMessage = ocrAttempted
          ? ocrFailureMessage
            ? `No extractable deck text; OCR fallback failed: ${ocrFailureMessage}`
            : "No extractable deck text after OCR fallback"
          : "No extractable deck text and OCR fallback could not be started";
        warnings.push("No extractable deck text; falling back to startup form data");
        this.logger.error(`[Extraction] ${errorMessage} | startup=${startupId}`);
        this.logger.warn(
          `[Extraction] Falling back to startup form context after extraction failures for startup ${startupId}`,
        );
        extractedText = fallbackText;
        source = "startup-context";
        pageCount = 0;
      } else {
        extractedText = fallbackText;
        source = "startup-context";
        warnings.push("No extractable deck text found; using startup form data only");
        this.logger.warn(
          `[Extraction] No extractable text found for startup ${startupId}; using startup context fallback`,
        );
      }
    }
    extractedText = this.mergeExtractionTexts(
      extractedText,
      supportingDocs.combinedText,
    );

    this.logger.debug(
      `[Extraction] Running field extraction | source=${source} | rawChars=${extractedText.length} | pageCount=${pageCount}`,
    );
    progress?.onStepStart("field_extraction", {
      inputJson: {
        source,
        pageCount,
      },
      inputText: extractedText,
    });
    let aiFields: ExtractedFields;
    try {
      aiFields = await this.fieldExtractor.extractFields(extractedText, record);
      progress?.onStepComplete("field_extraction", {
        summary: {
          fieldsExtracted: this.collectExtractedFieldKeys(aiFields),
          source,
        },
        outputJson: aiFields,
      });
    } catch (error) {
      progress?.onStepFailed("field_extraction", this.asMessage(error), {
        outputJson: {
          error: this.asMessage(error),
        },
      });
      throw error;
    }

    const result = this.buildResult(
      record,
      aiFields,
      extractedText,
      startupContext,
      source,
      pageCount,
      warnings,
    );

    // Extract structured deck data (non-fatal — KPI enrichment, not pipeline-critical)
    if (source !== "startup-context") {
      progress?.onStepStart("deck_structured_extraction");
      try {
        const deckStructuredData =
          await this.fieldExtractor.extractDeckStructuredData(extractedText);
        if (deckStructuredData) {
          result.deckStructuredData = deckStructuredData;
          this.logger.log(
            `[Extraction] Deck structured data extracted for startup ${startupId}`,
          );
          progress?.onStepComplete("deck_structured_extraction", {
            summary: { extracted: true },
            outputJson: deckStructuredData,
          });
        } else {
          progress?.onStepComplete("deck_structured_extraction", {
            summary: { extracted: false },
          });
        }
      } catch (error) {
        const message = this.asMessage(error);
        this.logger.warn(
          `[Extraction] Deck structured extraction failed (non-fatal) for startup ${startupId}: ${message}`,
        );
        progress?.onStepFailed("deck_structured_extraction", message);
      }
    }

    this.logger.log(
      `[Extraction] Completed extraction phase for startup ${startupId} | source=${result.source ?? "unknown"} | pageCount=${result.pageCount ?? 0} | warnings=${result.warnings?.length ?? 0}`,
    );
    if (result.warnings && result.warnings.length > 0) {
      this.logger.warn(
        `[Extraction] Warning summary for startup ${startupId}: ${result.warnings.join(" | ")}`,
      );
    }

    return result;
  }

  private buildResult(
    startupRecord: Startup,
    aiFields: ExtractedFields,
    rawText: string,
    startupContext: StartupFormContext,
    source: NonNullable<ExtractionResult["source"]>,
    pageCount: number,
    warnings: string[],
  ): ExtractionResult {
    const founderNames =
      aiFields.founderNames && aiFields.founderNames.length > 0
        ? aiFields.founderNames
        : (startupRecord.teamMembers ?? [])
            .map((member) => member.name?.trim())
            .filter((name): name is string => Boolean(name));

    const website = this.resolveWebsite(aiFields.website, startupRecord.website);
    const companyName = this.resolveCompanyName(
      aiFields.companyName,
      startupRecord.name,
      rawText,
      website,
    );
    const industry = this.resolveDisplayText(
      aiFields.industry,
      startupRecord.industry,
      "Unknown",
    );
    const location = this.resolveDisplayText(
      aiFields.location,
      startupRecord.location,
      "Unknown",
    );
    const stage = this.resolveStage(aiFields.stage, startupRecord.stage, rawText);

    const description =
      aiFields.description && aiFields.description.trim().length >= 20
        ? aiFields.description.trim()
        : undefined;

    return ExtractionSchema.parse({
      companyName,
      description,
      tagline: aiFields.tagline ?? startupRecord.tagline ?? "",
      founderNames,
      industry,
      stage,
      location,
      website,
      fundingAsk: aiFields.fundingAsk ?? startupRecord.fundingTarget,
      valuation: aiFields.valuation ?? startupRecord.valuation ?? undefined,
      rawText: this.limitText(rawText),
      startupContext,
      source,
      pageCount: pageCount > 0 ? pageCount : undefined,
      warnings: [...new Set(warnings)].filter(Boolean),
    });
  }

  private resolveWebsite(...candidates: Array<string | null | undefined>): string {
    for (const candidate of candidates) {
      if (!candidate) {
        continue;
      }

      try {
        const parsed = new URL(candidate);
        const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
        if (!host || host === "pending-extraction.com") {
          continue;
        }
        return parsed.toString();
      } catch {
        continue;
      }
    }

    return "";
  }

  private resolveDisplayText(
    primary: string | null | undefined,
    fallback: string | null | undefined,
    emptyFallback: string,
  ): string {
    const preferred = this.normalizeNonPlaceholderText(primary);
    if (preferred) {
      return preferred;
    }
    const fromFallback = this.normalizeNonPlaceholderText(fallback);
    if (fromFallback) {
      return fromFallback;
    }
    return emptyFallback;
  }

  private resolveCompanyName(
    aiCompanyName: string | null | undefined,
    startupName: string,
    rawText: string,
    websiteCandidate?: string | null,
  ): string {
    const aiCandidate = this.normalizeNonPlaceholderText(aiCompanyName);
    if (aiCandidate && !this.isLikelyFilenameStyleCompanyName(aiCandidate)) {
      return aiCandidate;
    }

    const inferredFromDeck = this.inferCompanyNameFromRawText(rawText);
    if (inferredFromDeck) {
      return inferredFromDeck;
    }

    const websiteDerivedName = this.extractCompanyNameFromWebsite(websiteCandidate);
    if (websiteDerivedName) {
      return websiteDerivedName;
    }

    const startupCandidate = this.normalizeNonPlaceholderText(startupName);
    if (
      startupCandidate &&
      !this.isLikelyPlaceholderCompanyName(startupCandidate) &&
      !this.isLikelyFilenameStyleCompanyName(startupCandidate)
    ) {
      return startupCandidate;
    }

    return "Untitled Startup";
  }

  private resolveStage(
    aiStage: string | null | undefined,
    startupStage: string | null | undefined,
    rawText: string,
  ): string {
    const aiCandidate = this.normalizeStageValue(aiStage);
    if (aiCandidate && this.hasExplicitStageSignal(rawText, aiCandidate)) {
      return aiCandidate;
    }

    const inferredFromDeck = this.inferStageFromRawText(rawText);
    if (inferredFromDeck) {
      return inferredFromDeck;
    }

    return this.normalizeStageValue(startupStage) ?? "seed";
  }

  private inferCompanyNameFromRawText(text: string): string | null {
    const inlineTitleMatch =
      text.match(
        /(?:^|\n)\s*([A-Z][A-Za-z0-9&.,'’\- ]{1,80}?)\s*(?:[—\-:|]\s*)?\bpitch\s*deck\b/i,
      )?.[1] ?? null;
    if (inlineTitleMatch) {
      return this.normalizePotentialCompanyName(inlineTitleMatch);
    }

    const headingMatch =
      text.match(
        /(?:^|\n)\s*#?\s*pitch\s*deck\s*[—\-:]\s*([^\n(]{2,120}?)(?:\s*\(|\s*$)/i,
      )?.[1] ?? null;
    if (headingMatch) {
      return this.normalizePotentialCompanyName(headingMatch);
    }

    const companyLineMatch =
      text.match(
        /(?:^|\n)\s*(?:company|startup)\s*(?:name)?\s*[:-]\s*([^\n]{2,120})/i,
      )?.[1] ?? null;
    if (companyLineMatch) {
      return this.normalizePotentialCompanyName(companyLineMatch);
    }

    const lines = text
      .split(/\r?\n/)
      .map((line) => line.replace(/\u2022/g, " ").trim())
      .filter((line) => line.length > 0)
      .slice(0, 40);

    for (let index = 1; index < Math.min(lines.length, 15); index += 1) {
      if (!/\bpitch\s*deck\b/i.test(lines[index])) {
        continue;
      }
      const candidate = this.normalizePotentialCompanyName(lines[index - 1]);
      if (candidate) {
        return candidate;
      }
    }

    if (lines.length >= 2 && /\bpitch\s*deck\b/i.test(lines[1])) {
      const candidate = this.normalizePotentialCompanyName(lines[0]);
      if (candidate) {
        return candidate;
      }
    }

    if (lines.length > 0 && /^[A-Z0-9&.,'’\- ]{2,80}$/.test(lines[0])) {
      const candidate = this.normalizePotentialCompanyName(lines[0]);
      if (candidate) {
        return candidate;
      }
    }

    return null;
  }

  private normalizePotentialCompanyName(
    value: string | null | undefined,
  ): string | null {
    if (!value) {
      return null;
    }

    let candidate = value
      .replace(/^[#>*\-\u2022]+\s*/, "")
      .replace(/\s+/g, " ")
      .trim();
    if (!candidate) {
      return null;
    }

    if (/^--\s*\d+\s+of\s+\d+\s*--$/i.test(candidate)) {
      return null;
    }

    candidate = candidate
      .replace(/\b(pitch\s*deck|presentation|slides?|confidential)\b/gi, "")
      .replace(/[:|/\-–—]+$/g, "")
      .replace(/\s+/g, " ")
      .trim();

    if (candidate.length < 2 || candidate.length > 80) {
      return null;
    }

    const normalized = this.normalizeNonPlaceholderText(candidate);
    if (!normalized) {
      return null;
    }

    if (this.isLikelyDeckSectionHeading(normalized)) {
      return null;
    }

    if (this.isLikelyReportDocumentTitle(normalized)) {
      return null;
    }

    if (this.isLikelyFilenameStyleCompanyName(normalized)) {
      return null;
    }

    if (/\b(page|slide)\s*\d+\b/i.test(normalized)) {
      return null;
    }

    return normalized;
  }

  private isLikelyDeckSectionHeading(value: string): boolean {
    const normalized = value
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const headings = new Set([
      "problem",
      "solution",
      "product",
      "market opportunity",
      "business model",
      "go to market",
      "go-to-market",
      "traction",
      "competitive advantage",
      "vision",
      "team",
      "financials",
      "ask",
      "overview",
      "introduction",
      "summary",
    ]);
    return headings.has(normalized);
  }

  private inferStageFromRawText(text: string): string | null {
    const normalized = text.toLowerCase();
    if (/\bpre[\s-]?seed\b/.test(normalized)) return "pre_seed";
    if (/\bseries[\s-]?a\b/.test(normalized)) return "series_a";
    if (/\bseries[\s-]?b\b/.test(normalized)) return "series_b";
    if (/\bseries[\s-]?c\b/.test(normalized)) return "series_c";
    if (/\bseries[\s-]?d\b/.test(normalized)) return "series_d";
    if (/\bseries[\s-]?e\b/.test(normalized)) return "series_e";
    if (/\bseries[\s-]?f(?:\+|[\s-]?plus)?\b/.test(normalized)) return "series_f_plus";
    if (/\bseed\b/.test(normalized)) return "seed";
    return null;
  }

  private normalizeStageValue(value: string | null | undefined): string | null {
    const normalized = this.normalizeNonPlaceholderText(value);
    if (!normalized) {
      return null;
    }

    const token = normalized.toLowerCase().replace(/[\s-]+/g, "_");
    const mapping: Record<string, string> = {
      pre_seed: "pre_seed",
      preseed: "pre_seed",
      seed: "seed",
      series_a: "series_a",
      series_b: "series_b",
      series_c: "series_c",
      series_d: "series_d",
      series_e: "series_e",
      series_f: "series_f_plus",
      series_f_plus: "series_f_plus",
      "series_f+": "series_f_plus",
    };
    return mapping[token] ?? null;
  }

  private hasExplicitStageSignal(text: string, stage: string): boolean {
    const normalized = text.toLowerCase();
    const patternByStage: Record<string, RegExp> = {
      pre_seed: /\bpre[\s-]?seed\b/i,
      seed: /\bseed\b/i,
      series_a: /\bseries[\s-]?a\b/i,
      series_b: /\bseries[\s-]?b\b/i,
      series_c: /\bseries[\s-]?c\b/i,
      series_d: /\bseries[\s-]?d\b/i,
      series_e: /\bseries[\s-]?e\b/i,
      series_f_plus: /\bseries[\s-]?f(?:\+|[\s-]?plus)?\b/i,
    };

    const pattern = patternByStage[stage];
    if (!pattern) {
      return false;
    }

    return pattern.test(normalized);
  }

  private normalizeNonPlaceholderText(value: string | null | undefined): string | null {
    if (!value || typeof value !== "string") {
      return null;
    }
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    const normalized = trimmed.toLowerCase();
    if (
      normalized.includes("pending extraction") ||
      normalized.includes("pending-extraction") ||
      normalized === "unknown" ||
      normalized === "n/a"
    ) {
      return null;
    }
    return trimmed;
  }

  private isLikelyPlaceholderCompanyName(value: string): boolean {
    const normalized = value.trim().toLowerCase();
    return (
      normalized === "untitled startup" ||
      normalized === "startup example" ||
      normalized.startsWith("startup ")
    );
  }

  private isLikelyFilenameStyleCompanyName(value: string): boolean {
    const normalized = value.trim().toLowerCase();
    if (!normalized) {
      return false;
    }

    if (/\.(pdf|pptx?|docx?)$/i.test(normalized)) {
      return true;
    }
    if (
      /\b(pitch\s*deck|deck|presentation|slides?|draft|final|version|copy)\b/i.test(
        normalized,
      )
    ) {
      return true;
    }
    if ((normalized.includes("_") || normalized.includes("-")) && /\d/.test(normalized)) {
      return true;
    }
    if (/^[a-z]{3,}\d{1,4}$/i.test(normalized)) {
      return true;
    }
    if (this.isLikelyReportDocumentTitle(normalized)) {
      return true;
    }

    return false;
  }

  private isLikelyReportDocumentTitle(value: string): boolean {
    const normalized = value.trim().toLowerCase();
    if (!normalized) {
      return false;
    }

    if (/^\d{4}\s+annual\s+report$/.test(normalized)) {
      return true;
    }
    if (/\bannual\s+report\b/.test(normalized)) {
      return true;
    }
    if (
      /\b(quarterly|q[1-4]|earnings?|supplemental|financial|shareholder)\b/.test(
        normalized,
      ) &&
      /\b(report|results?|data|statement|update)\b/.test(normalized)
    ) {
      return true;
    }
    if (/\bform\s*10[-\s]?[kq]\b/.test(normalized)) {
      return true;
    }

    return false;
  }

  private extractCompanyNameFromWebsite(
    website: string | null | undefined,
  ): string | null {
    if (!website) {
      return null;
    }

    try {
      const hostname = new URL(website).hostname.toLowerCase().replace(/^www\./, "");
      const segments = hostname.split(".").filter(Boolean);
      if (segments.length === 0) {
        return null;
      }

      let root = segments.length >= 2 ? segments[segments.length - 2] : segments[0];
      const broadSuffixes = new Set(["co", "com", "org", "net", "gov", "edu", "ac"]);
      if (broadSuffixes.has(root) && segments.length >= 3) {
        root = segments[segments.length - 3];
      }

      const genericLabels = new Set([
        "www",
        "app",
        "api",
        "docs",
        "mail",
        "admin",
        "portal",
        "staging",
        "dev",
        "beta",
      ]);
      if (!root || genericLabels.has(root)) {
        return null;
      }

      const candidate = root
        .replace(/[-_]+/g, " ")
        .trim()
        .split(/\s+/)
        .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
        .join(" ");

      if (!candidate || this.isLikelyFilenameStyleCompanyName(candidate)) {
        return null;
      }

      return candidate;
    } catch {
      return null;
    }
  }

  private buildSummary(startupRecord: Startup, startupContext: StartupFormContext): string {
    const lines: string[] = [
      `Company: ${startupRecord.name}`,
      `Tagline: ${startupRecord.tagline}`,
      `Description: ${startupRecord.description}`,
      `Industry: ${startupRecord.industry}`,
      `Stage: ${startupRecord.stage}`,
      `Location: ${startupRecord.location}`,
      `Website: ${startupRecord.website}`,
      `Funding target: ${startupRecord.fundingTarget}`,
      `Team size: ${startupRecord.teamSize}`,
    ];

    this.addSummaryLine(lines, "Sector group", startupContext.sectorIndustryGroup);
    this.addSummaryLine(lines, "Sector industry", startupContext.sectorIndustry);
    this.addSummaryLine(lines, "Round currency", startupContext.roundCurrency);
    this.addSummaryLine(lines, "Valuation", startupRecord.valuation);
    this.addSummaryLine(lines, "Valuation known", startupContext.valuationKnown);
    this.addSummaryLine(lines, "Valuation type", startupContext.valuationType);
    this.addSummaryLine(lines, "Raise type", startupContext.raiseType);
    this.addSummaryLine(lines, "Lead secured", startupContext.leadSecured);
    this.addSummaryLine(lines, "Lead investor", startupContext.leadInvestorName);
    this.addSummaryLine(lines, "Has previous funding", startupContext.hasPreviousFunding);
    this.addSummaryLine(
      lines,
      "Previous funding amount",
      startupContext.previousFundingAmount,
    );
    this.addSummaryLine(
      lines,
      "Previous funding currency",
      startupContext.previousFundingCurrency,
    );
    this.addSummaryLine(lines, "Previous investors", startupContext.previousInvestors);
    this.addSummaryLine(lines, "Previous round type", startupContext.previousRoundType);
    this.addSummaryLine(lines, "TRL", startupContext.technologyReadinessLevel);
    this.addSummaryLine(lines, "Demo URL", startupContext.demoUrl);
    this.addSummaryLine(lines, "Demo video URL", startupContext.demoVideoUrl);
    this.addSummaryLine(lines, "Product description", startupContext.productDescription);

    if (startupContext.teamMembers && startupContext.teamMembers.length > 0) {
      lines.push(
        `Team members: ${startupContext.teamMembers
          .map((member) =>
            member.role ? `${member.name} (${member.role})` : member.name,
          )
          .join(", ")}`,
      );
    }

    if (startupContext.files && startupContext.files.length > 0) {
      lines.push(
        `Uploaded files: ${startupContext.files
          .map((file) => `${file.name} [${file.type}]`)
          .join(", ")}`,
      );
    }

    if (startupContext.productScreenshots && startupContext.productScreenshots.length > 0) {
      lines.push(`Product screenshots: ${startupContext.productScreenshots.join(", ")}`);
    }

    const composed = lines.filter((line) => line.trim().length > 0).join("\n");
    return this.limitText(composed);
  }

  private async extractSupportingDocuments(
    startupRecord: Startup,
    progress?: PhaseProgressCallback,
  ): Promise<SupportingDocumentExtraction> {
    const files = startupRecord.files ?? [];
    const candidates = files.filter((file) =>
      this.isSupportingDocumentCandidate(file, startupRecord),
    );
    if (candidates.length === 0) {
      return {
        combinedText: "",
        candidateCount: 0,
        parsedCount: 0,
        warnings: [],
      };
    }

    progress?.onStepStart("supporting_docs_extraction", {
      inputJson: {
        files: candidates.map((file) => ({
          path: file.path,
          name: file.name,
          type: file.type,
        })),
      },
    });

    const warnings: string[] = [];
    const textBlocks: string[] = [];
    for (const file of candidates) {
      try {
        const extractedText = await this.extractTextFromSupportingFile(file);
        if (!extractedText) {
          warnings.push(`No extractable text found in supporting file "${file.name}"`);
          continue;
        }

        textBlocks.push(
          [
            `Supporting file: ${file.name}`,
            `Content type: ${file.type}`,
            extractedText,
          ].join("\n"),
        );
      } catch (error) {
        const message = this.asMessage(error);
        warnings.push(`Failed to process supporting file "${file.name}": ${message}`);
      }
    }

    const combinedText = textBlocks.join("\n\n---\n\n");
    progress?.onStepComplete("supporting_docs_extraction", {
      summary: {
        candidateFiles: candidates.length,
        parsedFiles: textBlocks.length,
      },
      outputJson: {
        candidateFiles: candidates.map((file) => file.name),
        parsedFiles: textBlocks.length,
        warnings,
      },
    });

    return {
      combinedText: this.limitText(combinedText),
      candidateCount: candidates.length,
      parsedCount: textBlocks.length,
      warnings,
    };
  }

  private isSupportingDocumentCandidate(
    file: StartupFileReference,
    startupRecord: Pick<Startup, "pitchDeckPath">,
  ): boolean {
    if (!file?.path) {
      return false;
    }
    if (startupRecord.pitchDeckPath && file.path === startupRecord.pitchDeckPath) {
      return false;
    }
    return this.isExtractableDocument(file);
  }

  private isExtractableDocument(file: StartupFileReference): boolean {
    const contentType = (file.type ?? "").toLowerCase();
    const filename = (file.name ?? "").toLowerCase();
    if (
      contentType === "application/pdf" ||
      contentType.includes("presentation") ||
      contentType.includes("powerpoint") ||
      contentType.includes("spreadsheet") ||
      contentType === "application/vnd.ms-excel" ||
      contentType.startsWith("text/") ||
      contentType === "application/json" ||
      contentType === "text/csv" ||
      contentType === "application/csv"
    ) {
      return true;
    }

    return /\.(pdf|pptx?|pps|xlsx?|csv|txt|md|json)$/i.test(filename);
  }

  private async extractTextFromSupportingFile(
    file: StartupFileReference,
  ): Promise<string> {
    const downloadUrl = await this.storage.getDownloadUrl(file.path, 900);
    const buffer = await this.fetchDocumentBuffer(downloadUrl, `supporting file ${file.name}`);
    const contentType = (file.type ?? "").toLowerCase();
    const filename = (file.name ?? "").toLowerCase();

    if (contentType === "application/pdf" || /\.pdf$/i.test(filename)) {
      const pdfResult = await this.pdfTextExtractor.extractText(buffer);
      if (pdfResult.hasContent) {
        return pdfResult.text;
      }

      const ocrResult = await this.pdfOcr.extractFromPdf(downloadUrl);
      return ocrResult.text;
    }

    if (
      contentType.includes("presentation") ||
      contentType.includes("powerpoint") ||
      /\.(pptx?|pps)$/i.test(filename)
    ) {
      const pptxResult = await this.pptxTextExtractor.extractText(buffer);
      return pptxResult.text;
    }

    if (
      contentType.includes("spreadsheet") ||
      contentType === "application/vnd.ms-excel" ||
      /\.xlsx?$/i.test(filename)
    ) {
      const excelResult = this.excelTextExtractor.extractText(buffer);
      return excelResult.text;
    }

    if (
      contentType.startsWith("text/") ||
      contentType === "application/json" ||
      contentType === "application/csv" ||
      /\.((txt|md|csv|json))$/i.test(filename)
    ) {
      return buffer.toString("utf-8");
    }

    return "";
  }

  private mergeExtractionTexts(...parts: Array<string | null | undefined>): string {
    const normalized = parts
      .map((value) => value?.trim() ?? "")
      .filter((value) => value.length > 0);
    if (normalized.length === 0) {
      return "";
    }
    return this.limitText(normalized.join("\n\n---\n\n"));
  }

  private limitText(text: string): string {
    const maxLength = this.maxTextChars;
    if (text.length <= maxLength) {
      return text;
    }

    return `${text.slice(0, maxLength)}\n\n[TRUNCATED]`;
  }

  private async fetchPdfBuffer(url: string): Promise<Buffer> {
    return this.fetchDocumentBuffer(url, "deck PDF");
  }

  private async fetchDocumentBuffer(url: string, descriptor: string): Promise<Buffer> {
    const response = await fetch(url, {
      method: "GET",
      signal: AbortSignal.timeout(this.fetchTimeoutMs),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} while downloading ${descriptor}`);
    }

    const contentLength = Number(response.headers.get("content-length") ?? "0");
    if (Number.isFinite(contentLength) && contentLength > this.maxPdfBytes) {
      const descriptorSentenceCase =
        descriptor.length > 0
          ? `${descriptor.charAt(0).toUpperCase()}${descriptor.slice(1)}`
          : descriptor;
      throw new Error(
        `${descriptorSentenceCase} exceeds maximum supported size (${Math.round(this.maxPdfBytes / (1024 * 1024))}MB)`,
      );
    }

    const body = await response.arrayBuffer();
    if (!body || body.byteLength === 0) {
      throw new Error(`Downloaded ${descriptor} is empty`);
    }

    return Buffer.from(body);
  }

  private isDeckPptx(
    record: Pick<Startup, "pitchDeckPath" | "pitchDeckUrl">,
  ): boolean {
    const path = record.pitchDeckPath || record.pitchDeckUrl || "";
    return /\.(pptx?|pps)$/i.test(path);
  }

  private redactUrl(url: string): string {
    try {
      const parsed = new URL(url);
      return `${parsed.origin}${parsed.pathname}`;
    } catch {
      return url;
    }
  }

  private async classifyAndSetPitchDeck(record: Startup): Promise<void> {
    const files = record.files ?? [];
    const pdfFiles = files.filter(
      (f) => (f.type ?? "").toLowerCase().includes("pdf") && f.path,
    );
    if (pdfFiles.length < 2) return;

    try {
      const snippets: Array<{ name: string; snippet: string; path: string }> =
        [];
      for (const file of pdfFiles) {
        try {
          const url = await this.storage.getDownloadUrl(file.path, 300);
          const buffer = await this.fetchPdfBuffer(url);
          const textResult =
            await this.pdfTextExtractor.extractText(buffer);
          snippets.push({
            name: file.name,
            snippet: textResult.text.slice(0, 1000),
            path: file.path,
          });
        } catch {
          this.logger.warn(
            `[Extraction] Failed to read snippet from ${file.name} for classification`,
          );
        }
      }

      if (snippets.length === 0) return;

      const classification =
        await this.fieldExtractor.classifyBestPitchDeck(
          snippets.map((s) => ({ name: s.name, snippet: s.snippet })),
        );
      if (
        classification &&
        classification.deckIndex >= 0 &&
        classification.deckIndex < snippets.length &&
        classification.confidence >= 0.5
      ) {
        const bestDeck = snippets[classification.deckIndex];
        if (bestDeck.path !== record.pitchDeckPath) {
          this.logger.log(
            `[Extraction] AI reclassified pitch deck → "${bestDeck.name}" (confidence=${classification.confidence}, was: ${record.pitchDeckPath ?? "none"})`,
          );
          await this.drizzle.db
            .update(startup)
            .set({ pitchDeckPath: bestDeck.path })
            .where(eq(startup.id, record.id));
          record.pitchDeckPath = bestDeck.path;
        } else {
          this.logger.debug(
            `[Extraction] AI confirmed pitch deck: "${bestDeck.name}" (confidence=${classification.confidence})`,
          );
        }
      } else if (classification && classification.deckIndex === -1) {
        this.logger.warn(
          `[Extraction] AI found no pitch deck among ${snippets.length} file(s)`,
        );
      }
    } catch (error) {
      this.logger.warn(
        `[Extraction] Deck classification failed, using existing pitchDeckPath: ${this.asMessage(error)}`,
      );
    }
  }

  private asMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  private mapStartupContext(startupRecord: Startup): StartupFormContext {
    const files: StartupFileReference[] | undefined =
      startupRecord.files && startupRecord.files.length > 0
        ? startupRecord.files.map((file) => ({
            path: file.path,
            name: file.name,
            type: file.type,
          }))
        : undefined;

    const teamMembers: StartupTeamMemberReference[] | undefined =
      startupRecord.teamMembers && startupRecord.teamMembers.length > 0
        ? startupRecord.teamMembers.map((member) => ({
            name: member.name,
            role: member.role || undefined,
            linkedinUrl: member.linkedinUrl || undefined,
          }))
        : undefined;

    return {
      sectorIndustryGroup: startupRecord.sectorIndustryGroup,
      sectorIndustry: startupRecord.sectorIndustry,
      pitchDeckPath: startupRecord.pitchDeckPath,
      pitchDeckUrl: startupRecord.pitchDeckUrl,
      demoUrl: startupRecord.demoUrl,
      logoUrl: startupRecord.logoUrl,
      files,
      teamMembers,
      roundCurrency: startupRecord.roundCurrency,
      valuationKnown: startupRecord.valuationKnown,
      valuationType: startupRecord.valuationType,
      raiseType: startupRecord.raiseType,
      leadSecured: startupRecord.leadSecured,
      leadInvestorName: startupRecord.leadInvestorName,
      contactName: startupRecord.contactName,
      contactEmail: startupRecord.contactEmail,
      contactPhone: startupRecord.contactPhone,
      contactPhoneCountryCode: startupRecord.contactPhoneCountryCode,
      hasPreviousFunding: startupRecord.hasPreviousFunding,
      previousFundingAmount: startupRecord.previousFundingAmount,
      previousFundingCurrency: startupRecord.previousFundingCurrency,
      previousInvestors: startupRecord.previousInvestors,
      previousRoundType: startupRecord.previousRoundType,
      technologyReadinessLevel: startupRecord.technologyReadinessLevel,
      demoVideoUrl: startupRecord.demoVideoUrl,
      productDescription: startupRecord.productDescription,
      productScreenshots:
        startupRecord.productScreenshots && startupRecord.productScreenshots.length > 0
          ? startupRecord.productScreenshots
          : undefined,
    };
  }

  private addSummaryLine(
    lines: string[],
    label: string,
    value: string | number | boolean | null | undefined,
  ): void {
    if (value === null || value === undefined || value === "") {
      return;
    }

    lines.push(`${label}: ${String(value)}`);
  }

  private collectExtractedFieldKeys(fields: ExtractedFields): string[] {
    return Object.entries(fields)
      .filter(([, value]) => {
        if (value === null || value === undefined) {
          return false;
        }
        if (typeof value === "string") {
          return value.trim().length > 0;
        }
        if (Array.isArray(value)) {
          return value.length > 0;
        }
        return true;
      })
      .map(([key]) => key);
  }

  private summarizeStartupContext(startupContext: StartupFormContext): {
    totalCount: number;
    presentCount: number;
    missingCount: number;
    missingKeys: string[];
  } {
    const entries = Object.entries(startupContext);
    const missingKeys = entries
      .filter(([, value]) => !this.hasContextValue(value))
      .map(([key]) => key);
    const totalCount = entries.length;
    const missingCount = missingKeys.length;

    return {
      totalCount,
      presentCount: totalCount - missingCount,
      missingCount,
      missingKeys,
    };
  }

  private hasContextValue(value: unknown): boolean {
    if (value === null || value === undefined) {
      return false;
    }
    if (typeof value === "string") {
      return value.trim().length > 0;
    }
    if (Array.isArray(value)) {
      return value.length > 0;
    }
    return true;
  }
}
