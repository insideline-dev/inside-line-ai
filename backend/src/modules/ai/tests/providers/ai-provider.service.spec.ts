import { beforeEach, describe, expect, it, jest } from "bun:test";
import { ConfigService } from "@nestjs/config";
import { AiProviderService } from "../../providers/ai-provider.service";
import type { AiConfigService } from "../../services/ai-config.service";
import { ModelPurpose } from "../../interfaces/pipeline.interface";

describe("AiProviderService", () => {
  let config: jest.Mocked<ConfigService>;
  let aiConfig: jest.Mocked<AiConfigService>;
  let service: AiProviderService;

  beforeEach(() => {
    config = {
      get: jest.fn(),
    } as unknown as jest.Mocked<ConfigService>;
    aiConfig = {
      getModelForPurpose: jest.fn().mockReturnValue("gemini-3.0-flash"),
    } as unknown as jest.Mocked<AiConfigService>;

    service = new AiProviderService(config, aiConfig);
  });

  it("returns OpenAI provider when key exists", () => {
    config.get.mockImplementation((key: string) =>
      key === "OPENAI_API_KEY" ? "openai-key" : undefined,
    );

    const provider = service.getOpenAi();

    expect(provider).toBeFunction();
  });

  it("returns Gemini provider when key exists", () => {
    config.get.mockImplementation((key: string) =>
      key === "GOOGLE_AI_API_KEY" ? "google-key" : undefined,
    );

    const provider = service.getGemini();

    expect(provider).toBeFunction();
  });

  it("returns Mistral client when key exists", () => {
    config.get.mockImplementation((key: string) =>
      key === "MISTRAL_API_KEY" ? "mistral-key" : undefined,
    );

    const client = service.getMistral();

    expect(client).toBeDefined();
    expect(client).toHaveProperty("ocr");
  });

  it("throws for missing keys", () => {
    config.get.mockReturnValue(undefined);

    expect(() => service.getOpenAi()).toThrow("OPENAI_API_KEY is required");
    expect(() => service.getGemini()).toThrow(
      "GOOGLE_AI_API_KEY or GOOGLE_API_KEY is required",
    );
    expect(() => service.getMistral()).toThrow("MISTRAL_API_KEY is required");
  });

  it("reuses cached providers", () => {
    config.get.mockImplementation((key: string) => {
      if (key === "OPENAI_API_KEY") return "openai-key";
      if (key === "GOOGLE_AI_API_KEY") return "google-key";
      if (key === "MISTRAL_API_KEY") return "mistral-key";
      return undefined;
    });

    const openAi1 = service.getOpenAi();
    const openAi2 = service.getOpenAi();
    const gemini1 = service.getGemini();
    const gemini2 = service.getGemini();
    const mistral1 = service.getMistral();
    const mistral2 = service.getMistral();

    expect(openAi1).toBe(openAi2);
    expect(gemini1).toBe(gemini2);
    expect(mistral1).toBe(mistral2);
  });

  it("resolves model by purpose", () => {
    aiConfig.getModelForPurpose.mockReturnValueOnce("gemini-3.0-flash");
    config.get.mockImplementation((key: string) =>
      key === "GOOGLE_AI_API_KEY" ? "google-key" : undefined,
    );

    const model = service.resolveModelForPurpose(ModelPurpose.RESEARCH);
    expect(model).toBeDefined();
    expect(aiConfig.getModelForPurpose).toHaveBeenCalledWith(
      ModelPurpose.RESEARCH,
    );
  });
});
