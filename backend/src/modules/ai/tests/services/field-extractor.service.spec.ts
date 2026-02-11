import { beforeEach, describe, expect, it, jest, mock } from "bun:test";

const generateTextMock = jest.fn();

mock.module("ai", () => ({
  generateText: generateTextMock,
  Output: { object: ({ schema }: { schema: unknown }) => schema },
}));

import { FieldExtractorService } from "../../services/field-extractor.service";
import { AiProviderService } from "../../providers/ai-provider.service";
import { ModelPurpose } from "../../interfaces/pipeline.interface";
import { AiPromptService } from "../../services/ai-prompt.service";
import { AiConfigService } from "../../services/ai-config.service";

describe("FieldExtractorService", () => {
  let service: FieldExtractorService;
  let providers: jest.Mocked<AiProviderService>;
  let promptService: jest.Mocked<AiPromptService>;
  let aiConfig: jest.Mocked<AiConfigService>;
  const resolvedModel = { providerModel: "gemini-3.0-flash" };

  beforeEach(() => {
    generateTextMock.mockReset();

    providers = {
      resolveModelForPurpose: jest.fn().mockReturnValue(resolvedModel),
    } as unknown as jest.Mocked<AiProviderService>;

    promptService = {
      resolve: jest.fn().mockResolvedValue({
        key: "extraction.fields",
        stage: null,
        systemPrompt: "extract",
        userPrompt: "{{startupContextJson}}\n{{pitchDeckText}}",
        source: "code",
        revisionId: null,
      }),
      renderTemplate: jest.fn().mockImplementation((template: string, vars: Record<string, string>) => {
        let rendered = template;
        for (const [key, value] of Object.entries(vars)) {
          rendered = rendered.replaceAll(`{{${key}}}`, value);
        }
        return rendered;
      }),
    } as unknown as jest.Mocked<AiPromptService>;

    aiConfig = {
      getExtractionTemperature: jest.fn().mockReturnValue(0.1),
      getExtractionMaxInputLength: jest.fn().mockReturnValue(80000),
    } as unknown as jest.Mocked<AiConfigService>;

    service = new FieldExtractorService(providers, promptService, aiConfig);
  });

  it("returns empty result when raw text is blank", async () => {
    const result = await service.extractFields("   ");

    expect(result).toEqual({});
    expect(generateTextMock).not.toHaveBeenCalled();
  });

  it("uses generateText and returns parsed extraction fields", async () => {
    generateTextMock.mockResolvedValue({
      output: {
        companyName: "Inside Line",
        founderNames: ["Alex Founder"],
        industry: "SaaS",
      },
    });

    const result = await service.extractFields("Pitch deck content");

    expect(providers.resolveModelForPurpose).toHaveBeenCalledWith(
      ModelPurpose.EXTRACTION,
    );
    expect(generateTextMock).toHaveBeenCalledTimes(1);
    expect(result.companyName).toBe("Inside Line");
    expect(result.founderNames).toEqual(["Alex Founder"]);
  });

  it("falls back to empty extraction on model error", async () => {
    generateTextMock.mockRejectedValue(new Error("provider timeout"));

    const result = await service.extractFields("Pitch deck content");

    expect(result).toEqual({});
  });
});
