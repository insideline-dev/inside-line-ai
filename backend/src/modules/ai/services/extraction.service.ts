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
import { MistralOcrService } from "./mistral-ocr.service";
import { PdfTextExtractorService } from "./pdf-text-extractor.service";
import { PptxTextExtractorService } from "./pptx-text-extractor.service";

@Injectable()
export class ExtractionService {
  private readonly logger = new Logger(ExtractionService.name);
  private readonly maxTextChars: number;
  private readonly maxPdfBytes: number;
  private readonly fetchTimeoutMs: number;

  constructor(
    private config: ConfigService,
    private drizzle: DrizzleService,
    private storage: StorageService,
    private pdfTextExtractor: PdfTextExtractorService,
    private pptxTextExtractor: PptxTextExtractorService,
    private mistralOcr: MistralOcrService,
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
    this.logger.log(`[Extraction] Starting extraction phase for startup ${startupId}`);

    const [record] = await this.drizzle.db
      .select()
      .from(startup)
      .where(eq(startup.id, startupId))
      .limit(1);

    if (!record) {
      throw new Error(`Startup ${startupId} not found`);
    }

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

    if (!record.pitchDeckPath && !record.pitchDeckUrl) {
      warnings.push("No pitch deck found; using startup form data only");
      this.logger.warn(
        `[Extraction] No deck source found for startup ${startupId}; using startup context fallback`,
      );
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
          method: "mistral-ocr",
          deckUrl,
        },
      });
      try {
        this.logger.log(
          `[Extraction] Running OCR fallback for startup ${startupId} using ${this.redactUrl(deckUrl)}`,
        );
        const ocrResult = await this.mistralOcr.extractFromPdf(deckUrl);
        extractedText = ocrResult.text;
        pageCount = Math.max(pageCount, ocrResult.pages.length);
        source = "mistral-ocr";
        this.logger.log(
          `[Extraction] OCR succeeded | pages=${ocrResult.pages.length} | chars=${ocrResult.text.length}`,
        );
        progress?.onStepComplete("ocr_fallback", {
          summary: {
            method: "mistral-ocr",
            pages: ocrResult.pages.length,
            chars: ocrResult.text.length,
          },
          outputText: ocrResult.text,
          outputJson: ocrResult,
        });
      } catch (error) {
        const message = this.asMessage(error);
        ocrFailureMessage = message;
        warnings.push(`Mistral OCR failed: ${message}`);
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

    const companyName = this.resolveCompanyName(
      aiFields.companyName,
      startupRecord.name,
      rawText,
    );
    const website = this.resolveWebsite(aiFields.website, startupRecord.website);
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

    return ExtractionSchema.parse({
      companyName,
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
  ): string {
    const aiCandidate = this.normalizeNonPlaceholderText(aiCompanyName);
    if (aiCandidate) {
      return aiCandidate;
    }

    const startupCandidate = this.normalizeNonPlaceholderText(startupName);
    if (startupCandidate && !this.isLikelyPlaceholderCompanyName(startupCandidate)) {
      return startupCandidate;
    }

    const inferredFromDeck = this.inferCompanyNameFromRawText(rawText);
    if (inferredFromDeck) {
      return inferredFromDeck;
    }

    return startupCandidate ?? "Untitled Startup";
  }

  private resolveStage(
    aiStage: string | null | undefined,
    startupStage: string | null | undefined,
    rawText: string,
  ): string {
    const aiCandidate = this.normalizeNonPlaceholderText(aiStage);
    if (aiCandidate) {
      return aiCandidate;
    }

    const inferredFromDeck = this.inferStageFromRawText(rawText);
    if (inferredFromDeck) {
      return inferredFromDeck;
    }

    return this.normalizeNonPlaceholderText(startupStage) ?? "seed";
  }

  private inferCompanyNameFromRawText(text: string): string | null {
    const headingMatch =
      text.match(
        /(?:^|\n)\s*#?\s*pitch\s*deck\s*[—\-:]\s*([^\n(]{2,120}?)(?:\s*\(|\s*$)/i,
      )?.[1] ?? null;
    if (headingMatch) {
      return this.normalizeNonPlaceholderText(headingMatch);
    }

    const companyLineMatch =
      text.match(
        /(?:^|\n)\s*(?:company|startup)\s*(?:name)?\s*[:-]\s*([^\n]{2,120})/i,
      )?.[1] ?? null;
    if (companyLineMatch) {
      return this.normalizeNonPlaceholderText(companyLineMatch);
    }

    return null;
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

  private limitText(text: string): string {
    const maxLength = this.maxTextChars;
    if (text.length <= maxLength) {
      return text;
    }

    return `${text.slice(0, maxLength)}\n\n[TRUNCATED]`;
  }

  private async fetchPdfBuffer(url: string): Promise<Buffer> {
    const response = await fetch(url, {
      method: "GET",
      signal: AbortSignal.timeout(this.fetchTimeoutMs),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} while downloading deck PDF`);
    }

    const contentLength = Number(response.headers.get("content-length") ?? "0");
    if (Number.isFinite(contentLength) && contentLength > this.maxPdfBytes) {
      throw new Error(
        `Deck PDF exceeds maximum supported size (${Math.round(this.maxPdfBytes / (1024 * 1024))}MB)`,
      );
    }

    const body = await response.arrayBuffer();
    if (!body || body.byteLength === 0) {
      throw new Error("Downloaded deck PDF is empty");
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
