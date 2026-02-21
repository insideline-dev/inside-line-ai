import { beforeEach, describe, expect, it, jest, mock } from "bun:test";

const getTextMock = jest.fn();
const destroyMock = jest.fn();

class MockPDFParse {
  constructor(_params: unknown) {}

  getText() {
    return getTextMock();
  }

  destroy() {
    return destroyMock();
  }
}

mock.module("pdf-parse", () => ({
  PDFParse: MockPDFParse,
}));

import { PdfTextExtractorService } from "../../services/pdf-text-extractor.service";

describe("PdfTextExtractorService", () => {
  let service: PdfTextExtractorService;

  beforeEach(() => {
    service = new PdfTextExtractorService();
    getTextMock.mockReset();
    destroyMock.mockReset();
    destroyMock.mockResolvedValue(undefined);
  });

  it("marks parse output as contentful when alphanumeric text crosses threshold", async () => {
    getTextMock.mockResolvedValue({
      text: "This pitch deck explains a SaaS product with market traction and strong team execution across multiple slides.",
      total: 2,
      pages: [{ num: 1, text: "slide1" }, { num: 2, text: "slide2" }],
    });

    const result = await service.extractText(Buffer.from([1, 2, 3]));

    expect(result.hasContent).toBe(true);
    expect(result.hasSparsePages).toBe(true);
    expect(result.sparsePageCount).toBe(2);
    expect(result.pageCount).toBe(2);
    expect(result.text).toContain("This pitch deck");
    expect(destroyMock).toHaveBeenCalledTimes(1);
  });

  it("marks parse output as non-contentful when text is mostly structural markers", async () => {
    getTextMock.mockResolvedValue({
      text: "Page 1\n1\nPage 2\n2\nPage 3",
      total: 3,
      pages: [{ num: 1, text: "p1" }, { num: 2, text: "p2" }, { num: 3, text: "p3" }],
    });

    const result = await service.extractText(Buffer.from([1, 2, 3]));

    expect(result.hasContent).toBe(false);
    expect(result.pageCount).toBe(3);
    expect(result.hasSparsePages).toBe(true);
    expect(result.sparsePageCount).toBe(3);
  });

  it("throws on empty buffer", async () => {
    await expect(service.extractText(Buffer.alloc(0))).rejects.toThrow(
      "Invalid PDF buffer: file is empty",
    );
  });

  it("detects sparse pages when some slides are image-only", async () => {
    const richText = "This pitch deck explains a SaaS product with market traction and strong team execution across multiple verticals and regions with detailed financial projections.";
    getTextMock.mockResolvedValue({
      text: richText + " " + richText,
      total: 5,
      pages: [
        { num: 1, text: richText },
        { num: 2, text: "" },
        { num: 3, text: "1" },
        { num: 4, text: "" },
        { num: 5, text: richText },
      ],
    });

    const result = await service.extractText(Buffer.from([1, 2, 3]));

    expect(result.hasContent).toBe(true);
    expect(result.hasSparsePages).toBe(true);
    expect(result.sparsePageCount).toBe(3);
  });

  it("does not flag sparse pages when only title slide is sparse", async () => {
    getTextMock.mockResolvedValue({
      text: "Title. " + "A".repeat(400),
      total: 10,
      pages: [
        { num: 1, text: "Title." },
        ...Array.from({ length: 9 }, (_, i) => ({
          num: i + 2,
          text: "A".repeat(30),
        })),
      ],
    });

    const result = await service.extractText(Buffer.from([1, 2, 3]));

    expect(result.hasContent).toBe(true);
    expect(result.hasSparsePages).toBe(false);
    expect(result.sparsePageCount).toBe(1);
  });

  it("returns hasSparsePages=false when pages array is empty", async () => {
    getTextMock.mockResolvedValue({
      text: "",
      total: 0,
      pages: [],
    });

    const result = await service.extractText(Buffer.from([1, 2, 3]));

    expect(result.hasSparsePages).toBe(false);
    expect(result.sparsePageCount).toBe(0);
  });

  it("wraps parser failures with extraction context", async () => {
    getTextMock.mockRejectedValue(new Error("corrupt file"));

    await expect(service.extractText(Buffer.from([1, 2, 3]))).rejects.toThrow(
      "PDF text extraction failed: corrupt file",
    );
    expect(destroyMock).toHaveBeenCalledTimes(1);
  });
});
