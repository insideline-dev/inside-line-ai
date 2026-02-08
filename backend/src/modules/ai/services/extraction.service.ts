import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { eq } from "drizzle-orm";
import { DrizzleService } from "../../../database";
import { StorageService } from "../../../storage";
import { startup, type Startup } from "../../startup/entities";
import { ExtractionResult } from "../interfaces/phase-results.interface";
import { ExtractionSchema } from "../schemas";
import { FieldExtractorService, type ExtractedFields } from "./field-extractor.service";
import { MistralOcrService } from "./mistral-ocr.service";
import { PdfTextExtractorService } from "./pdf-text-extractor.service";

@Injectable()
export class ExtractionService {
  private readonly maxTextChars: number;
  private readonly maxPdfBytes: number;
  private readonly fetchTimeoutMs: number;

  constructor(
    private config: ConfigService,
    private drizzle: DrizzleService,
    private storage: StorageService,
    private pdfTextExtractor: PdfTextExtractorService,
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

  async run(startupId: string): Promise<ExtractionResult> {
    const [record] = await this.drizzle.db
      .select()
      .from(startup)
      .where(eq(startup.id, startupId))
      .limit(1);

    if (!record) {
      throw new Error(`Startup ${startupId} not found`);
    }

    const warnings: string[] = [];
    const fallbackText = this.buildSummary(record.tagline, record.description);

    if (!record.pitchDeckPath && !record.pitchDeckUrl) {
      warnings.push("No pitch deck found; using startup form data only");
      return this.buildResult(record, {}, fallbackText, "startup-context", 0, warnings);
    }

    let deckUrl: string | null = null;
    let pdfBuffer: Buffer | null = null;

    if (record.pitchDeckPath) {
      try {
        deckUrl = await this.storage.getDownloadUrl(record.pitchDeckPath, 900);
        pdfBuffer = await this.fetchPdfBuffer(deckUrl);
      } catch (error) {
        warnings.push(`Unable to load PDF from pitchDeckPath: ${this.asMessage(error)}`);
      }
    }

    if (!pdfBuffer && record.pitchDeckUrl) {
      try {
        deckUrl = record.pitchDeckUrl;
        pdfBuffer = await this.fetchPdfBuffer(record.pitchDeckUrl);
      } catch (error) {
        warnings.push(`Unable to load PDF from pitchDeckUrl: ${this.asMessage(error)}`);
      }
    }

    if (!pdfBuffer) {
      warnings.push("Deck file is unavailable; using startup form data only");
      return this.buildResult(record, {}, fallbackText, "startup-context", 0, warnings);
    }

    let source: ExtractionResult["source"] = "startup-context";
    let extractedText = "";
    let pageCount = 0;

    try {
      const pdfResult = await this.pdfTextExtractor.extractText(pdfBuffer);
      pageCount = pdfResult.pageCount;

      if (pdfResult.hasContent) {
        extractedText = pdfResult.text;
        source = "pdf-parse";
      } else {
        warnings.push("PDF appears scanned/image-only; switching to OCR");
      }
    } catch (error) {
      warnings.push(`pdf-parse failed: ${this.asMessage(error)}`);
    }

    if (!extractedText && deckUrl) {
      try {
        const ocrResult = await this.mistralOcr.extractFromPdf(deckUrl);
        extractedText = ocrResult.text;
        pageCount = Math.max(pageCount, ocrResult.pages.length);
        source = "mistral-ocr";
      } catch (error) {
        warnings.push(`Mistral OCR failed: ${this.asMessage(error)}`);
      }
    }

    if (!extractedText) {
      extractedText = fallbackText;
      source = "startup-context";
      warnings.push("No extractable deck text found; using startup form data only");
    }

    const aiFields = await this.fieldExtractor.extractFields(extractedText, record);

    return this.buildResult(record, aiFields, extractedText, source, pageCount, warnings);
  }

  private buildResult(
    startupRecord: Startup,
    aiFields: ExtractedFields,
    rawText: string,
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

    return ExtractionSchema.parse({
      companyName: aiFields.companyName ?? startupRecord.name,
      tagline: aiFields.tagline ?? startupRecord.tagline ?? "",
      founderNames,
      industry: aiFields.industry ?? startupRecord.industry,
      stage: aiFields.stage ?? startupRecord.stage,
      location: aiFields.location ?? startupRecord.location,
      website,
      fundingAsk: aiFields.fundingAsk ?? startupRecord.fundingTarget,
      valuation: aiFields.valuation ?? startupRecord.valuation ?? undefined,
      rawText: this.limitText(rawText),
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
        return new URL(candidate).toString();
      } catch {
        continue;
      }
    }

    return "";
  }

  private buildSummary(tagline: string, description: string): string {
    const composed = `${tagline}. ${description}`.trim();
    return this.limitText(composed || description || tagline || "");
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

  private asMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
