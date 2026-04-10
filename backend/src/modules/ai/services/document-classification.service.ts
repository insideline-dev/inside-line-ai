import { Injectable, Logger } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { DrizzleService } from "../../../database";
import { StorageService } from "../../../storage";
import { startup } from "../../startup/entities";
import {
  DocumentCategory,
  CATEGORY_AGENT_MAP,
  type ClassifiedFile,
} from "../interfaces/document-classification.interface";
import type { StartupFileReference } from "../interfaces/phase-results.interface";
import { ModelPurpose } from "../interfaces/pipeline.interface";
import { AiProviderService } from "../providers/ai-provider.service";
import { AiModelExecutionService } from "./ai-model-execution.service";
import { ExcelTextExtractorService } from "./excel-text-extractor.service";
import { PdfTextExtractorService } from "./pdf-text-extractor.service";

const CONFIDENCE_THRESHOLD = 0.7;

const ClassificationOutputSchema = z.object({
  category: z.nativeEnum(DocumentCategory),
  confidence: z.number().min(0).max(1),
});

type ClassificationOutput = z.infer<typeof ClassificationOutputSchema>;

interface HeuristicResult {
  category: DocumentCategory;
  confidence: number;
}

const FILENAME_PATTERNS: Array<{ pattern: RegExp; category: DocumentCategory; confidence: number }> = [
  { pattern: /pitch|deck|teaser|presentation|slides/i, category: DocumentCategory.PITCH_DECK, confidence: 0.85 },
  { pattern: /cap.?table|capitalization|share.?register/i, category: DocumentCategory.CAP_TABLE, confidence: 0.9 },
  { pattern: /financ|p&l|revenue|budget|forecast|balance.?sheet|cash.?flow|income.?statement/i, category: DocumentCategory.FINANCIAL, confidence: 0.85 },
  { pattern: /contract|agreement|nda|mou|term.?sheet|sla/i, category: DocumentCategory.CONTRACT, confidence: 0.85 },
  { pattern: /legal|compliance|ip|patent|trademark|incorporation|articles/i, category: DocumentCategory.LEGAL, confidence: 0.8 },
  { pattern: /team|org.?chart|hiring|hr|headcount|personnel|roster/i, category: DocumentCategory.TEAM_HR, confidence: 0.8 },
  { pattern: /market|tam|sam|som|industry|landscape|addressable/i, category: DocumentCategory.MARKET_RESEARCH, confidence: 0.8 },
  { pattern: /product|technical|architecture|roadmap|spec|wireframe/i, category: DocumentCategory.TECHNICAL_PRODUCT, confidence: 0.75 },
  { pattern: /business.?plan|strategy|go.?to.?market|gtm/i, category: DocumentCategory.BUSINESS_PLAN, confidence: 0.8 },
];

const SHEET_NAME_PATTERNS: Array<{ pattern: RegExp; category: DocumentCategory }> = [
  { pattern: /cap.?table|shareholders|equity|vesting/i, category: DocumentCategory.CAP_TABLE },
  { pattern: /p&l|income|revenue|forecast|budget|cash.?flow|balance/i, category: DocumentCategory.FINANCIAL },
  { pattern: /team|employees|headcount|org/i, category: DocumentCategory.TEAM_HR },
  { pattern: /market|tam|competitors/i, category: DocumentCategory.MARKET_RESEARCH },
];

@Injectable()
export class DocumentClassificationService {
  private readonly logger = new Logger(DocumentClassificationService.name);

  constructor(
    private drizzle: DrizzleService,
    private storage: StorageService,
    private providers: AiProviderService,
    private modelExecution: AiModelExecutionService,
    private excelTextExtractor: ExcelTextExtractorService,
    private pdfTextExtractor: PdfTextExtractorService,
  ) {}

  async classifyDocuments(startupId: string): Promise<ClassifiedFile[]> {
    const [record] = await this.drizzle.db
      .select({ files: startup.files, pitchDeckPath: startup.pitchDeckPath })
      .from(startup)
      .where(eq(startup.id, startupId))
      .limit(1);

    if (!record?.files || record.files.length === 0) {
      this.logger.log(`[Classification] No files to classify for startup ${startupId}`);
      return [];
    }

    const files = record.files as StartupFileReference[];
    const classified: ClassifiedFile[] = [];

    for (const file of files) {
      try {
        const result = await this.classifySingleFile(file, record.pitchDeckPath);
        classified.push({
          path: file.path,
          name: file.name,
          type: file.type,
          category: result.category,
          confidence: result.confidence,
        });
      } catch (error) {
        this.logger.warn(
          `[Classification] Failed to classify "${file.name}": ${error instanceof Error ? error.message : String(error)}`,
        );
        classified.push({
          path: file.path,
          name: file.name,
          type: file.type,
          category: DocumentCategory.MISCELLANEOUS,
          confidence: 0.3,
        });
      }
    }

    await this.drizzle.db
      .update(startup)
      .set({ files: classified })
      .where(eq(startup.id, startupId));

    this.logger.log(
      `[Classification] Classified ${classified.length} files for startup ${startupId}: ${classified.map((f) => `${f.name}→${f.category}`).join(", ")}`,
    );

    return classified;
  }

  async classifySingleFile(
    file: StartupFileReference,
    pitchDeckPath: string | null = null,
  ): Promise<HeuristicResult> {
    if (pitchDeckPath && file.path === pitchDeckPath) {
      return { category: DocumentCategory.PITCH_DECK, confidence: 1.0 };
    }

    const heuristic = this.classifyByHeuristics(file);
    if (heuristic && heuristic.confidence >= CONFIDENCE_THRESHOLD) {
      return heuristic;
    }

    const llmResult = await this.classifyByLLM(file);
    if (llmResult) return llmResult;

    return heuristic ?? { category: DocumentCategory.MISCELLANEOUS, confidence: 0.3 };
  }

  private classifyByHeuristics(file: StartupFileReference): HeuristicResult | null {
    const filename = file.name ?? "";
    const ext = this.getExtension(filename);
    let bestMatch: HeuristicResult | null = null;

    for (const { pattern, category, confidence } of FILENAME_PATTERNS) {
      if (pattern.test(filename)) {
        if (!bestMatch || confidence > bestMatch.confidence) {
          bestMatch = { category, confidence };
        }
      }
    }

    if (this.isExcelFile(file)) {
      const sheetResult = this.classifyBySheetNames(file);
      if (sheetResult && (!bestMatch || sheetResult.confidence > bestMatch.confidence)) {
        bestMatch = sheetResult;
      }

      if (!bestMatch && (ext === "xlsx" || ext === "xls" || ext === "csv")) {
        bestMatch = { category: DocumentCategory.FINANCIAL, confidence: 0.6 };
      }
    }

    return bestMatch;
  }

  private classifyBySheetNames(file: StartupFileReference): HeuristicResult | null {
    try {
      const sheetNames = (file as ClassifiedFile & { _sheetNames?: string[] })._sheetNames;
      if (!sheetNames || sheetNames.length === 0) return null;

      for (const { pattern, category } of SHEET_NAME_PATTERNS) {
        if (sheetNames.some((name) => pattern.test(name))) {
          return { category, confidence: 0.85 };
        }
      }
    } catch {
      return null;
    }
    return null;
  }

  private async classifyByLLM(file: StartupFileReference): Promise<HeuristicResult | null> {
    try {
      const snippet = await this.extractSnippet(file);
      if (!snippet) return null;

      const categories = Object.values(DocumentCategory).join(", ");
      const prompt = `Classify this document into one of these categories: ${categories}

Filename: "${file.name}"
File type: ${file.type}
Content preview (first ~500 chars):
---
${snippet.slice(0, 500)}
---

Return the most appropriate category and your confidence (0-1).`;

      const response = await this.modelExecution.generateText<ClassificationOutput>({
        model: this.providers.resolveModelForPurpose(ModelPurpose.EXTRACTION),
        schema: ClassificationOutputSchema,
        temperature: 0,
        system:
          "You classify startup-related documents. Given a filename, file type, and a short content preview, determine the document category. Be precise — financial models and cap tables are different categories. If uncertain, use miscellaneous.",
        prompt,
      });

      const output = response.output ?? response.experimental_output;
      if (!output) return null;

      return { category: output.category, confidence: output.confidence };
    } catch (error) {
      this.logger.warn(
        `[Classification] LLM classification failed for "${file.name}": ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  private async extractSnippet(file: StartupFileReference): Promise<string | null> {
    try {
      const downloadUrl = await this.storage.getDownloadUrl(file.path, 300);
      const response = await fetch(downloadUrl);
      if (!response.ok) return null;

      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.byteLength === 0) return null;

      const contentType = (file.type ?? "").toLowerCase();
      const filename = (file.name ?? "").toLowerCase();

      if (contentType === "application/pdf" || filename.endsWith(".pdf")) {
        const result = await this.pdfTextExtractor.extractText(buffer);
        return result.text.slice(0, 500);
      }

      if (this.isExcelFile(file)) {
        const result = this.excelTextExtractor.extractText(buffer);
        return result.text.slice(0, 500);
      }

      if (contentType.startsWith("text/") || /\.(csv|txt|md|json)$/i.test(filename)) {
        return buffer.toString("utf-8").slice(0, 500);
      }

      return null;
    } catch {
      return null;
    }
  }

  private isExcelFile(file: StartupFileReference): boolean {
    const contentType = (file.type ?? "").toLowerCase();
    const filename = (file.name ?? "").toLowerCase();
    return (
      contentType.includes("spreadsheet") ||
      contentType === "application/vnd.ms-excel" ||
      /\.xlsx?$/i.test(filename)
    );
  }

  private getExtension(filename: string): string {
    const dot = filename.lastIndexOf(".");
    return dot >= 0 ? filename.slice(dot + 1).toLowerCase() : "";
  }

  getAgentKeysForFile(file: ClassifiedFile): string[] {
    if (!file.category) return [];
    return CATEGORY_AGENT_MAP[file.category] ?? [];
  }
}
