import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import OpenAI from "openai";
import { MistralOcrService } from "./mistral-ocr.service";

export interface PdfOcrPage {
  pageNumber: number;
  content: string;
}

export interface PdfOcrResult {
  text: string;
  pages: PdfOcrPage[];
  provider: "openai" | "mistral";
  model: string;
}

@Injectable()
export class PdfOcrService {
  private client: OpenAI | null;

  constructor(
    private config: ConfigService,
    private mistralOcr: MistralOcrService,
  ) {
    const apiKey = this.config.get<string>("OPENAI_API_KEY");
    this.client = apiKey ? new OpenAI({ apiKey }) : null;
  }

  async extractFromPdf(pdfUrl: string): Promise<PdfOcrResult> {
    try {
      const mistralResult = await this.mistralOcr.extractFromPdf(pdfUrl);
      return {
        ...mistralResult,
        provider: "mistral",
        model: "mistral-ocr-latest",
      };
    } catch (mistralError) {
      try {
        return await this.tryOpenAi(pdfUrl);
      } catch (openAiError) {
        const mistralMessage = mistralError instanceof Error ? mistralError.message : String(mistralError);
        const openAiMessage = openAiError instanceof Error ? openAiError.message : String(openAiError);
        throw new Error(
          `Mistral OCR failed: ${mistralMessage}; GPT fallback failed: ${openAiMessage}`,
        );
      }
    }
  }

  private async tryOpenAi(pdfUrl: string): Promise<PdfOcrResult> {
    if (!this.client) {
      throw new ServiceUnavailableException("OPENAI_API_KEY is not configured");
    }

    const model = "gpt-5.4-mini";
    const response = await this.client.responses.create({
      model,
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_file",
              file_url: pdfUrl,
            },
            {
              type: "input_text",
              text: "Extract all readable text from this PDF in plain text. Preserve reading order. Include text from scanned pages or embedded images when needed. Do not summarize.",
            },
          ],
        },
      ],
    });

    const text = response.output_text.trim();
    if (!this.hasUsableContent(text)) {
      throw new Error("GPT OCR returned empty content");
    }

    return {
      text,
      pages: [{ pageNumber: 1, content: text }],
      provider: "openai",
      model,
    };
  }

  private hasUsableContent(text: string): boolean {
    if (!text) {
      return false;
    }

    return text.replace(/[^a-z0-9]/gi, "").length >= 80;
  }
}
