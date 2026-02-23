import { beforeEach, describe, expect, it, jest } from "bun:test";
import { AiModelConfigService } from "../../services/ai-model-config.service";
import { ModelPurpose } from "../../interfaces/pipeline.interface";

describe("AiModelConfigService defaults", () => {
  let service: AiModelConfigService;

  beforeEach(() => {
    const drizzle = { db: {} };
    const aiConfig = {
      getModelForPurpose: jest.fn().mockReturnValue("gpt-5.2"),
    };

    service = new AiModelConfigService(drizzle as never, aiConfig as never);
  });

  it("uses gemini + provider search as default for research keys", () => {
    const resolved = (
      service as unknown as {
        buildDefaultResolvedConfig: (
          key: string,
          stage: null,
          purpose: ModelPurpose,
        ) => {
          modelName: string;
          searchMode: string;
        };
      }
    ).buildDefaultResolvedConfig("research.market", null, ModelPurpose.RESEARCH);

    expect(resolved.modelName).toBe("gemini-3.0-flash-preview");
    expect(resolved.searchMode).toBe("provider_grounded_search");
  });
});
