import { Injectable } from "@nestjs/common";
import type { OCRResponse } from "@mistralai/mistralai/models/components";
import { AiProviderService } from "../providers/ai-provider.service";

export interface MistralOcrPage {
  pageNumber: number;
  content: string;
}

export interface MistralOcrResult {
  text: string;
  pages: MistralOcrPage[];
}

@Injectable()
export class MistralOcrService {
  constructor(private providers: AiProviderService) {}

  async extractFromPdf(presignedUrl: string): Promise<MistralOcrResult> {
    const mistral = this.providers.getMistral();

    const response = await mistral.ocr.process({
      model: "mistral-ocr-latest",
      document: {
        type: "document_url",
        documentUrl: presignedUrl,
      },
      includeImageBase64: true,
      tableFormat: "html",
    });

    return this.mapResponse(response);
  }

  private mapResponse(response: OCRResponse): MistralOcrResult {
    const pages = response.pages.map((page) => ({
      pageNumber: page.index + 1,
      content: page.markdown.trim(),
    }));

    if (pages.length === 0) {
      throw new Error("Mistral OCR returned no pages");
    }

    const nonEmptyPages = pages.filter((page) => page.content.length > 0);
    if (nonEmptyPages.length === 0) {
      throw new Error("Mistral OCR returned empty content");
    }

    const text = nonEmptyPages
      .map((page) => `\n\n[Page ${page.pageNumber}]\n${page.content}`)
      .join("")
      .trim();

    return { text, pages };
  }
}
