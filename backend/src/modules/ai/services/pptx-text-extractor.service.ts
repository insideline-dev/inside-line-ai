import { Injectable } from "@nestjs/common";

interface OfficeParserAstNode {
  type?: string;
  text?: string;
}

interface OfficeParserAst {
  content: OfficeParserAstNode[];
  toText(): string;
}

interface OfficeParserModule {
  OfficeParser: {
    parseOffice(input: Buffer): Promise<OfficeParserAst>;
  };
}

export interface PptxTextResult {
  text: string;
  pageCount: number;
  hasContent: boolean;
  hasSparsePages: boolean;
  sparsePageCount: number;
}

@Injectable()
export class PptxTextExtractorService {
  async extractText(buffer: Buffer): Promise<PptxTextResult> {
    if (!buffer || buffer.byteLength === 0) {
      throw new Error("Invalid PPTX buffer: file is empty");
    }

    const officeParserModuleName: string = "officeparser";
    const { OfficeParser } = (await import(
      officeParserModuleName
    )) as OfficeParserModule;
    const ast = await OfficeParser.parseOffice(buffer);

    const slideNodes = ast.content.filter((node) => node.type === "slide");
    const pageCount = slideNodes.length;
    const { hasSparsePages, sparsePageCount } = this.detectSparseSlides(slideNodes);

    const raw = ast.toText();
    const text = this.normalizeText(raw);

    return {
      text,
      pageCount,
      hasContent: this.hasActualContent(text),
      hasSparsePages,
      sparsePageCount,
    };
  }

  private normalizeText(text: string): string {
    return text
      .split("\u0000")
      .join("")
      .replace(/\r\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  private hasActualContent(text: string): boolean {
    if (!text) return false;

    const lines = text
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .filter((line) => !this.isStructuralLine(line));

    if (lines.length === 0) return false;

    const alphanumeric = lines.join(" ").replace(/[^a-z0-9]/gi, "").length;
    return alphanumeric >= 80;
  }

  private detectSparseSlides(
    slideNodes: Array<{ text?: string }>,
  ): { hasSparsePages: boolean; sparsePageCount: number } {
    if (slideNodes.length === 0) {
      return { hasSparsePages: false, sparsePageCount: 0 };
    }

    const SPARSE_CHAR_THRESHOLD = 20;
    const SPARSE_RATIO_THRESHOLD = 0.15;

    const sparsePageCount = slideNodes.filter((slide) => {
      const alphanumeric = (slide.text ?? "").replace(/[^a-z0-9]/gi, "").length;
      return alphanumeric < SPARSE_CHAR_THRESHOLD;
    }).length;

    const hasSparsePages = sparsePageCount / slideNodes.length > SPARSE_RATIO_THRESHOLD;

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
