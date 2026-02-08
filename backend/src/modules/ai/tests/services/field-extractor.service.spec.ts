import { beforeEach, describe, expect, it, jest, mock } from "bun:test";

const generateObjectMock = jest.fn();

mock.module("ai", () => ({
  generateObject: generateObjectMock,
}));

import { FieldExtractorService } from "../../services/field-extractor.service";
import { AiProviderService } from "../../providers/ai-provider.service";
import { ModelPurpose } from "../../interfaces/pipeline.interface";

describe("FieldExtractorService", () => {
  let service: FieldExtractorService;
  let providers: jest.Mocked<AiProviderService>;
  const resolvedModel = { providerModel: "gemini-3.0-flash" };

  beforeEach(() => {
    generateObjectMock.mockReset();

    providers = {
      resolveModelForPurpose: jest.fn().mockReturnValue(resolvedModel),
    } as unknown as jest.Mocked<AiProviderService>;

    service = new FieldExtractorService(providers);
  });

  it("returns empty result when raw text is blank", async () => {
    const result = await service.extractFields("   ");

    expect(result).toEqual({});
    expect(generateObjectMock).not.toHaveBeenCalled();
  });

  it("uses generateObject and returns parsed extraction fields", async () => {
    generateObjectMock.mockResolvedValue({
      object: {
        companyName: "Inside Line",
        founderNames: ["Alex Founder"],
        industry: "SaaS",
      },
    });

    const result = await service.extractFields("Pitch deck content");

    expect(providers.resolveModelForPurpose).toHaveBeenCalledWith(
      ModelPurpose.EXTRACTION,
    );
    expect(generateObjectMock).toHaveBeenCalledTimes(1);
    expect(result.companyName).toBe("Inside Line");
    expect(result.founderNames).toEqual(["Alex Founder"]);
  });

  it("falls back to empty extraction on model error", async () => {
    generateObjectMock.mockRejectedValue(new Error("provider timeout"));

    const result = await service.extractFields("Pitch deck content");

    expect(result).toEqual({});
  });
});
