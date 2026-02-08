import { beforeEach, describe, expect, it, jest } from "bun:test";
import type { DrizzleService } from "../../../../database";
import type { PdfService } from "../../../startup/pdf.service";
import type { StorageService } from "../../../../storage/storage.service";
import { MemoGeneratorService } from "../../services/memo-generator.service";
import { createMockSynthesisResult } from "../fixtures/mock-synthesis.fixture";

describe("MemoGeneratorService", () => {
  let service: MemoGeneratorService;
  let drizzle: jest.Mocked<DrizzleService>;
  let pdfService: jest.Mocked<PdfService>;
  let storage: jest.Mocked<StorageService>;

  beforeEach(() => {
    drizzle = {
      db: {
        select: jest.fn().mockReturnValue({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockResolvedValue([
              {
                id: "startup-1",
                userId: "founder-1",
              },
            ]),
          }),
        }),
      },
    } as unknown as jest.Mocked<DrizzleService>;

    pdfService = {
      generateMemo: jest.fn().mockResolvedValue(Buffer.from("memo-pdf")),
      generateReport: jest.fn().mockResolvedValue(Buffer.from("report-pdf")),
    } as unknown as jest.Mocked<PdfService>;

    storage = {
      uploadGeneratedContent: jest
        .fn()
        .mockResolvedValueOnce({ key: "memo-key", url: "https://cdn.test/memo.pdf" })
        .mockResolvedValueOnce({ key: "report-key", url: "https://cdn.test/report.pdf" }),
    } as unknown as jest.Mocked<StorageService>;

    service = new MemoGeneratorService(
      drizzle as unknown as DrizzleService,
      pdfService as unknown as PdfService,
      storage as unknown as StorageService,
    );
  });

  it("generates investor memo and founder report PDFs and uploads them", async () => {
    const result = await service.generateAndUpload("startup-1", createMockSynthesisResult());

    expect(pdfService.generateMemo).toHaveBeenCalledWith("startup-1", "founder-1");
    expect(pdfService.generateReport).toHaveBeenCalledWith("startup-1", "founder-1");
    expect(storage.uploadGeneratedContent).toHaveBeenCalledTimes(2);
    expect(result.investorMemoUrl).toBe("https://cdn.test/memo.pdf");
    expect(result.founderReportUrl).toBe("https://cdn.test/report.pdf");
  });
});
