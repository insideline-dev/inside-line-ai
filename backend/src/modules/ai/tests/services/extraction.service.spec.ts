import { beforeEach, describe, expect, it, jest } from "bun:test";
import { ConfigService } from "@nestjs/config";
import { DrizzleService } from "../../../../database";
import { StorageService } from "../../../../storage";
import { ExtractionService } from "../../services/extraction.service";
import { FieldExtractorService } from "../../services/field-extractor.service";
import { MistralOcrService } from "../../services/mistral-ocr.service";
import { PdfTextExtractorService } from "../../services/pdf-text-extractor.service";
import { PptxTextExtractorService } from "../../services/pptx-text-extractor.service";

describe("ExtractionService", () => {
  let service: ExtractionService;
  let config: jest.Mocked<ConfigService>;
  let drizzle: jest.Mocked<DrizzleService>;
  let storage: jest.Mocked<StorageService>;
  let pdfTextExtractor: jest.Mocked<PdfTextExtractorService>;
  let pptxTextExtractor: jest.Mocked<PptxTextExtractorService>;
  let mistralOcr: jest.Mocked<MistralOcrService>;
  let fieldExtractor: jest.Mocked<FieldExtractorService>;

  const startupRecord = {
    id: "startup-1",
    name: "Inside Line",
    tagline: "AI diligence pipeline",
    description: "We automate startup screening.",
    industry: "SaaS",
    stage: "seed",
    location: "San Francisco, CA",
    website: "https://inside-line.test",
    fundingTarget: 1_500_000,
    teamSize: 8,
    valuation: 9_000_000,
    sectorIndustryGroup: "Enterprise Software",
    sectorIndustry: "Workflow Automation",
    roundCurrency: "USD",
    valuationKnown: true,
    valuationType: "pre_money",
    raiseType: "safe",
    leadSecured: false,
    leadInvestorName: null,
    hasPreviousFunding: true,
    previousFundingAmount: 750_000,
    previousFundingCurrency: "USD",
    previousInvestors: "Operator Angels",
    previousRoundType: "pre-seed",
    technologyReadinessLevel: "mvp",
    demoVideoUrl: "https://inside-line.test/demo-video",
    productDescription: "Workflow copilot for startup diligence.",
    productScreenshots: ["https://inside-line.test/image-1.png"],
    files: [
      {
        path: "user/startup/files/product-one-pager.pdf",
        name: "Product One Pager",
        type: "application/pdf",
      },
    ],
    teamMembers: [
      { name: "Alex Founder", role: "CEO", linkedinUrl: "https://linkedin.com/in/alex" },
    ],
    pitchDeckPath: "user/startup/pitch-deck/deck.pdf",
    pitchDeckUrl: null,
  };

  const mockDb = {
    select: jest.fn().mockReturnThis(),
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    limit: jest.fn(),
  };

  beforeEach(() => {
    mockDb.limit.mockResolvedValue([startupRecord]);

    config = {
      get: jest.fn((key: string, fallback?: unknown) => {
        if (key === "WEBSITE_SCRAPE_TIMEOUT_MS") return 30_000;
        if (key === "AI_EXTRACTION_MAX_TEXT_CHARS") return 180_000;
        if (key === "AI_EXTRACTION_MAX_PDF_BYTES") return 100 * 1024 * 1024;
        return fallback;
      }),
    } as unknown as jest.Mocked<ConfigService>;

    drizzle = { db: mockDb as any } as jest.Mocked<DrizzleService>;
    storage = {
      getDownloadUrl: jest.fn().mockResolvedValue("https://storage.test/deck.pdf"),
    } as unknown as jest.Mocked<StorageService>;
    pdfTextExtractor = {
      extractText: jest.fn().mockResolvedValue({
        text: "Page 1 text",
        pageCount: 12,
        hasContent: true,
        hasSparsePages: false,
        sparsePageCount: 0,
      }),
    } as unknown as jest.Mocked<PdfTextExtractorService>;
    pptxTextExtractor = {
      extractText: jest.fn().mockResolvedValue({
        text: "Slide 1 text",
        pageCount: 10,
        hasContent: true,
        hasSparsePages: false,
        sparsePageCount: 0,
      }),
    } as unknown as jest.Mocked<PptxTextExtractorService>;
    mistralOcr = {
      extractFromPdf: jest.fn().mockResolvedValue({
        text: "OCR text",
        pages: [{ pageNumber: 1, content: "OCR text" }],
      }),
    } as unknown as jest.Mocked<MistralOcrService>;
    fieldExtractor = {
      extractFields: jest.fn().mockResolvedValue({
        companyName: "Inside Line AI",
        founderNames: ["Alex Founder"],
      }),
    } as unknown as jest.Mocked<FieldExtractorService>;

    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: jest.fn().mockReturnValue("1024") },
      arrayBuffer: jest.fn().mockResolvedValue(new Uint8Array([1, 2, 3, 4]).buffer),
    }) as any;

    service = new ExtractionService(
      config,
      drizzle,
      storage,
      pdfTextExtractor,
      pptxTextExtractor,
      mistralOcr,
      fieldExtractor,
    );
  });

  it("returns startup-context fallback when no deck path/url exists", async () => {
    mockDb.limit.mockResolvedValueOnce([
      {
        ...startupRecord,
        pitchDeckPath: null,
        pitchDeckUrl: null,
      },
    ]);

    const result = await service.run("startup-1");

    expect(result.source).toBe("startup-context");
    expect(result.rawText).toContain("AI diligence pipeline");
    expect(result.warnings).toContain(
      "No pitch deck found; using startup form data only",
    );
    expect(result.startupContext?.technologyReadinessLevel).toBe("mvp");
    expect(result.startupContext?.raiseType).toBe("safe");
    expect(result.rawText).toContain("Raise type: safe");
    expect(fieldExtractor.extractFields).not.toHaveBeenCalled();
  });

  it("uses pdf-parse result when text content exists", async () => {
    const result = await service.run("startup-1");

    expect(storage.getDownloadUrl).toHaveBeenCalledWith(
      startupRecord.pitchDeckPath,
      900,
    );
    expect(pdfTextExtractor.extractText).toHaveBeenCalledTimes(1);
    expect(mistralOcr.extractFromPdf).not.toHaveBeenCalled();
    expect(result.source).toBe("pdf-parse");
    expect(result.pageCount).toBe(12);
    expect(result.companyName).toBe("Inside Line AI");
  });

  it("falls back to pitchDeckUrl when pitchDeckPath download fails", async () => {
    mockDb.limit.mockResolvedValueOnce([
      {
        ...startupRecord,
        pitchDeckUrl: "https://public.example.com/deck.pdf",
      },
    ]);
    storage.getDownloadUrl.mockRejectedValueOnce(new Error("signed URL failed"));

    const result = await service.run("startup-1");

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://public.example.com/deck.pdf",
      expect.any(Object),
    );
    expect(result.source).toBe("pdf-parse");
    expect(result.warnings).toContain(
      "Unable to load PDF from pitchDeckPath: signed URL failed",
    );
  });

  it("falls back to OCR for scanned PDFs", async () => {
    pdfTextExtractor.extractText.mockResolvedValueOnce({
      text: "",
      pageCount: 8,
      hasContent: false,
      hasSparsePages: false,
      sparsePageCount: 0,
    });
    fieldExtractor.extractFields.mockResolvedValueOnce({});

    const result = await service.run("startup-1");

    expect(mistralOcr.extractFromPdf).toHaveBeenCalledWith(
      "https://storage.test/deck.pdf",
    );
    expect(result.source).toBe("mistral-ocr");
    expect(result.warnings).toContain(
      "PDF appears scanned/image-only; switching to OCR",
    );
  });

  it("falls back safely when both parser and OCR fail", async () => {
    pdfTextExtractor.extractText.mockRejectedValueOnce(
      new Error("invalid PDF"),
    );
    mistralOcr.extractFromPdf.mockRejectedValueOnce(new Error("OCR timeout"));
    await expect(service.run("startup-1")).rejects.toThrow(
      "No extractable deck text; OCR fallback failed: OCR timeout",
    );
  });

  it("treats parse-no-text as warning and falls back to OCR without failing text_extraction step", async () => {
    pdfTextExtractor.extractText.mockResolvedValueOnce({
      text: "",
      pageCount: 8,
      hasContent: false,
      hasSparsePages: false,
      sparsePageCount: 0,
    });
    fieldExtractor.extractFields.mockResolvedValueOnce({});
    const onStepStart = jest.fn();
    const onStepComplete = jest.fn();
    const onStepFailed = jest.fn();

    const result = await service.run("startup-1", {
      onStepStart,
      onStepComplete,
      onStepFailed,
    });

    expect(result.source).toBe("mistral-ocr");
    expect(onStepFailed).not.toHaveBeenCalledWith(
      "text_extraction",
      expect.any(String),
      expect.anything(),
    );
    expect(onStepComplete).toHaveBeenCalledWith(
      "text_extraction",
      expect.objectContaining({
        summary: expect.objectContaining({
          fallbackRequired: true,
        }),
      }),
    );
  });

  it("falls back to startup context when downloaded PDF exceeds size limit", async () => {
    globalThis.fetch = jest.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: { get: jest.fn().mockReturnValue(String(120 * 1024 * 1024)) },
      arrayBuffer: jest.fn().mockResolvedValue(new Uint8Array([1, 2, 3]).buffer),
    }) as any;
    fieldExtractor.extractFields.mockResolvedValueOnce({});

    const result = await service.run("startup-1");

    expect(result.source).toBe("startup-context");
    expect(result.warnings).toContain(
      "Unable to load PDF from pitchDeckPath: Deck PDF exceeds maximum supported size (100MB)",
    );
    expect(result.warnings).toContain(
      "Deck file is unavailable; using startup form data only",
    );
  });

  it("falls back to startup context when downloaded PDF is empty", async () => {
    globalThis.fetch = jest.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: { get: jest.fn().mockReturnValue("0") },
      arrayBuffer: jest.fn().mockResolvedValue(new Uint8Array().buffer),
    }) as any;
    fieldExtractor.extractFields.mockResolvedValueOnce({});

    const result = await service.run("startup-1");

    expect(result.source).toBe("startup-context");
    expect(result.warnings).toContain(
      "Unable to load PDF from pitchDeckPath: Downloaded deck PDF is empty",
    );
  });

  it("throws when startup does not exist", async () => {
    mockDb.limit.mockResolvedValueOnce([]);

    await expect(service.run("missing")).rejects.toThrow(
      "Startup missing not found",
    );
  });
});
