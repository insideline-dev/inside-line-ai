import { Injectable } from "@nestjs/common";

export interface PdfTextResult {
  text: string;
  pageCount: number;
  hasContent: boolean;
}

@Injectable()
export class PdfTextExtractorService {
  async extractText(buffer: Buffer): Promise<PdfTextResult> {
    if (!buffer || buffer.byteLength === 0) {
      throw new Error("Invalid PDF buffer: file is empty");
    }

    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: buffer });

    try {
      const result = await parser.getText();
      const text = this.normalizeText(result.text ?? "");
      const pageCount = result.total ?? result.pages?.length ?? 0;

      return {
        text,
        pageCount,
        hasContent: this.hasActualContent(text, pageCount),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`PDF text extraction failed: ${message}`);
    } finally {
      await parser.destroy().catch(() => undefined);
    }
  }

  private normalizeText(text: string): string {
    return text
      .split("\u0000")
      .join("")
      .replace(/\r\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  private hasActualContent(text: string, pageCount: number): boolean {
    if (!text) {
      return false;
    }

    const lines = text
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .filter((line) => !this.isStructuralLine(line));

    if (lines.length === 0) {
      return false;
    }

    const alphanumeric = lines.join(" ").replace(/[^a-z0-9]/gi, "").length;
    const threshold = Math.max(80, pageCount * 40);

    return alphanumeric >= threshold;
  }

  private isStructuralLine(line: string): boolean {
    return (
      /^page\s+\d+(\s+of\s+\d+)?$/i.test(line) ||
      /^slide\s+\d+(\s+of\s+\d+)?$/i.test(line) ||
      /^\d+$/.test(line)
    );
  }
}
