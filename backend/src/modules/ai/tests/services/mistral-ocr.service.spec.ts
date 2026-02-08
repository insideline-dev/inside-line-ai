import { beforeEach, describe, expect, it, jest } from "bun:test";
import { AiProviderService } from "../../providers/ai-provider.service";
import { AiConfigService } from "../../services/ai-config.service";
import { MistralOcrService } from "../../services/mistral-ocr.service";

describe("MistralOcrService", () => {
  let service: MistralOcrService;
  let providers: jest.Mocked<AiProviderService>;
  let aiConfig: jest.Mocked<AiConfigService>;
  let processMock: jest.Mock;

  beforeEach(() => {
    processMock = jest.fn().mockResolvedValue({
      pages: [
        { index: 0, markdown: "# Slide One", images: [], dimensions: null },
        { index: 1, markdown: "# Slide Two", images: [], dimensions: null },
      ],
      model: "mistral-ocr-latest",
      usageInfo: { pagesProcessed: 2 },
    });

    providers = {
      getMistral: jest.fn().mockReturnValue({
        ocr: {
          process: processMock,
        },
      }),
    } as unknown as jest.Mocked<AiProviderService>;

    aiConfig = {
      getModelForPurpose: jest.fn().mockReturnValue("mistral-ocr-latest"),
    } as unknown as jest.Mocked<AiConfigService>;

    service = new MistralOcrService(providers, aiConfig);
  });

  it("calls Mistral SDK OCR API with document_url and maps page output", async () => {
    const result = await service.extractFromPdf("https://storage.test/deck.pdf");

    expect(processMock).toHaveBeenCalledWith({
      model: "mistral-ocr-latest",
      document: {
        type: "document_url",
        documentUrl: "https://storage.test/deck.pdf",
      },
      includeImageBase64: true,
      tableFormat: "html",
    });
    expect(result.pages).toHaveLength(2);
    expect(result.pages[0]).toEqual({ pageNumber: 1, content: "# Slide One" });
    expect(result.text).toContain("[Page 1]");
  });

  it("throws when OCR returns no pages", async () => {
    processMock.mockResolvedValueOnce({
      pages: [],
      model: "mistral-ocr-latest",
      usageInfo: { pagesProcessed: 0 },
    });

    await expect(service.extractFromPdf("https://storage.test/deck.pdf")).rejects.toThrow(
      "Mistral OCR returned no pages",
    );
  });

  it("throws when OCR pages have empty text", async () => {
    processMock.mockResolvedValueOnce({
      pages: [{ index: 0, markdown: "   ", images: [], dimensions: null }],
      model: "mistral-ocr-latest",
      usageInfo: { pagesProcessed: 1 },
    });

    await expect(service.extractFromPdf("https://storage.test/deck.pdf")).rejects.toThrow(
      "Mistral OCR returned empty content",
    );
  });
});
