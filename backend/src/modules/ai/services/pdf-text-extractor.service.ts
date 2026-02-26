import { Injectable } from "@nestjs/common";

export interface PdfTextResult {
  text: string;
  pageCount: number;
  hasContent: boolean;
  hasSparsePages: boolean;
  sparsePageCount: number;
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
      const { hasSparsePages, sparsePageCount } = this.detectSparsePages(
        result.pages ?? [],
        pageCount,
      );

      return {
        text,
        pageCount,
        hasContent: this.hasActualContent(text, pageCount),
        hasSparsePages,
        sparsePageCount,
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

  private detectSparsePages(
    pages: Array<{ num: number; text: string }>,
    pageCount: number,
  ): { hasSparsePages: boolean; sparsePageCount: number } {
    if (pages.length === 0) {
      return { hasSparsePages: false, sparsePageCount: 0 };
    }

    const SPARSE_CHAR_THRESHOLD = 20;
    const SPARSE_RATIO_THRESHOLD = 0.15;

    const sparsePageCount = pages.filter((page) => {
      const alphanumeric = (page.text ?? "").replace(/[^a-z0-9]/gi, "").length;
      return alphanumeric < SPARSE_CHAR_THRESHOLD;
    }).length;

    const total = pageCount || pages.length;
    const hasSparsePages = sparsePageCount / total > SPARSE_RATIO_THRESHOLD;

    return { hasSparsePages, sparsePageCount };
  }

  private isStructuralLine(line: string): boolean {
    return (
      /^page\s+\d+(\s+of\s+\d+)?$/i.test(line) ||
      /^slide\s+\d+(\s+of\s+\d+)?$/i.test(line) ||
      /^\d+$/.test(line)
    );
  }
}
