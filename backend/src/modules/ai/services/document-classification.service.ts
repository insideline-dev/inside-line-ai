import { Injectable, Logger } from "@nestjs/common";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import { StorageService } from "../../../storage";
import {
  DocumentCategory,
  CATEGORY_AGENT_MAP,
  ALL_EVALUATION_AGENTS,
  type ClassifiedFile,
} from "../interfaces/document-classification.interface";
import type { StartupFileReference } from "../interfaces/phase-results.interface";
import { ModelPurpose } from "../interfaces/pipeline.interface";
import { AiProviderService } from "../providers/ai-provider.service";
import { AiModelExecutionService } from "./ai-model-execution.service";
import { ExcelTextExtractorService } from "./excel-text-extractor.service";
import { PdfTextExtractorService } from "./pdf-text-extractor.service";

const ClassificationOutputSchema = z.object({
  reasoning: z.string().describe("Brief reasoning about what the document contains and why you chose this category"),
  category: z.nativeEnum(DocumentCategory),
  confidence: z.number().min(0).max(1),
});

type ClassificationOutput = z.infer<typeof ClassificationOutputSchema>;

export interface ClassificationResult {
  category: DocumentCategory;
  confidence: number;
  routedAgents: string[];
}

function loadClassificationPrompt(): string {
  const candidates = [
    resolve(process.cwd(), "src/modules/ai/prompts/library/global/classification/system.md"),
    resolve(process.cwd(), "backend/src/modules/ai/prompts/library/global/classification/system.md"),
  ];
  for (const path of candidates) {
    try {
      return readFileSync(path, "utf-8");
    } catch {
      // try next
    }
  }
  throw new Error("Classification system prompt not found in prompts/library/global/classification/system.md");
}

@Injectable()
export class DocumentClassificationService {
  private readonly logger = new Logger(DocumentClassificationService.name);
  private readonly systemPrompt = loadClassificationPrompt();

  constructor(
    private storage: StorageService,
    private providers: AiProviderService,
    private modelExecution: AiModelExecutionService,
    private excelTextExtractor: ExcelTextExtractorService,
    private pdfTextExtractor: PdfTextExtractorService,
  ) {}

  async classifySingleFile(file: StartupFileReference): Promise<ClassificationResult> {
    try {
      const { head, tail } = await this.extractHeadTail(file);
      const categories = Object.values(DocumentCategory).join(", ");
      const headPreview = head || "[no extractable text — classify by filename and file type alone]";
      const tailPreview = tail && tail !== head ? `\n\nContent (last ~1500 chars):\n---\n${tail}\n---` : "";
      const prompt = `Filename: "${file.name ?? "unknown"}"
File type: ${file.type ?? "unknown"}

Content (first ~1500 chars):
---
${headPreview}
---${tailPreview}

Categories: ${categories}

IMPORTANT: A pitch deck is a slide-based investor presentation (typically contains slides about problem, solution, market, team, financials, ask). Do NOT confuse it with a business plan (which is a longer prose document about strategy/operations). If the document has slide-like structure or mentions "Series A/B/C", "investment", "fundraising", it's likely a pitch_deck.

Think step by step: look at the filename, the beginning of the document, and the end of the document. Consider what kind of document this is based on its structure, tone, and content. Then return your reasoning, the category, and a confidence between 0 and 1.`;

      const response = await this.modelExecution.generateText<ClassificationOutput>({
        model: this.providers.resolveModelForPurpose(ModelPurpose.CLASSIFICATION),
        schema: ClassificationOutputSchema,
        temperature: 0,
        system: this.systemPrompt,
        prompt,
      });

      const output = response.output ?? response.experimental_output;
      if (!output) {
        this.logger.warn(`[Classification] Empty LLM output for "${file.name}"`);
        return this.fallback();
      }

      return {
        category: output.category,
        confidence: output.confidence,
        routedAgents: CATEGORY_AGENT_MAP[output.category] ?? [],
      };
    } catch (error) {
      this.logger.warn(
        `[Classification] LLM classification failed for "${file.name}": ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  getRoutedAgents(category: DocumentCategory): string[] {
    return CATEGORY_AGENT_MAP[category] ?? [];
  }

  getAllAgentKeys(): string[] {
    return [...ALL_EVALUATION_AGENTS];
  }

  getAgentKeysForFile(file: ClassifiedFile): string[] {
    if (!file.category) return [];
    return CATEGORY_AGENT_MAP[file.category] ?? [];
  }

  private fallback(): ClassificationResult {
    return {
      category: DocumentCategory.MISCELLANEOUS,
      confidence: 0,
      routedAgents: CATEGORY_AGENT_MAP[DocumentCategory.MISCELLANEOUS] ?? [],
    };
  }

  private async extractHeadTail(
    file: StartupFileReference,
  ): Promise<{ head: string | null; tail: string | null }> {
    const empty = { head: null, tail: null };
    try {
      const downloadUrl = await this.storage.getDownloadUrl(file.path, 300);
      const response = await fetch(downloadUrl);
      if (!response.ok) return empty;

      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.byteLength === 0) return empty;

      const contentType = (file.type ?? "").toLowerCase();
      const filename = (file.name ?? "").toLowerCase();

      let fullText: string | null = null;

      if (contentType === "application/pdf" || filename.endsWith(".pdf")) {
        const result = await this.pdfTextExtractor.extractText(buffer);
        fullText = result.text;
      } else if (this.isExcelFile(file)) {
        const result = this.excelTextExtractor.extractText(buffer);
        fullText = result.text;
      } else if (
        contentType.startsWith("text/") ||
        /\.(csv|txt|md|json)$/i.test(filename)
      ) {
        fullText = buffer.toString("utf-8");
      }

      if (!fullText) return empty;

      const HEAD_SIZE = 1500;
      const TAIL_SIZE = 1500;
      const head = fullText.slice(0, HEAD_SIZE);
      const tail =
        fullText.length > HEAD_SIZE + TAIL_SIZE
          ? fullText.slice(-TAIL_SIZE)
          : fullText.length > HEAD_SIZE
            ? fullText.slice(HEAD_SIZE)
            : null;

      return { head, tail };
    } catch {
      return empty;
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
}
