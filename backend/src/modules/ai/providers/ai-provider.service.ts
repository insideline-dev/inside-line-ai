import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createOpenAI } from "@ai-sdk/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { Mistral } from "@mistralai/mistralai";
import { ModelPurpose } from "../interfaces/pipeline.interface";
import { AiConfigService } from "../services/ai-config.service";

const MODEL_PROVIDER_PREFIX: Record<string, string> = {
  gpt: "openai",
  o1: "openai",
  o3: "openai",
  gemini: "google",
  claude: "anthropic",
  mistral: "mistral",
};

@Injectable()
export class AiProviderService {
  private openAiClient: ReturnType<typeof createOpenAI> | null = null;
  private geminiClient: ReturnType<typeof createGoogleGenerativeAI> | null = null;
  private mistralClient: Mistral | null = null;

  constructor(
    private config: ConfigService,
    private aiConfig: AiConfigService,
  ) {}

  getOpenAi() {
    if (this.openAiClient) {
      return this.openAiClient;
    }

    const apiKey = this.config.get<string>("OPENAI_API_KEY");
    this.assertKey(apiKey, "OPENAI_API_KEY");
    this.openAiClient = createOpenAI({ apiKey });
    return this.openAiClient;
  }

  getGemini() {
    if (this.geminiClient) {
      return this.geminiClient;
    }

    const apiKey =
      this.config.get<string>("GOOGLE_AI_API_KEY") ??
      this.config.get<string>("GOOGLE_API_KEY");
    this.assertKey(apiKey, "GOOGLE_AI_API_KEY or GOOGLE_API_KEY");
    this.geminiClient = createGoogleGenerativeAI({ apiKey });
    return this.geminiClient;
  }

  getMistral() {
    if (this.mistralClient) {
      return this.mistralClient;
    }

    const apiKey = this.config.get<string>("MISTRAL_API_KEY");
    this.assertKey(apiKey, "MISTRAL_API_KEY");
    this.mistralClient = new Mistral({ apiKey });
    return this.mistralClient;
  }

  resolveModel(modelName: string) {
    const provider = this.resolveProviderForModel(modelName);
    if (provider === "openai") {
      return this.getOpenAi()(modelName);
    }
    return this.getGemini()(modelName);
  }

  resolveModelForPurpose(purpose: ModelPurpose) {
    const modelName = this.aiConfig.getModelForPurpose(purpose);
    return this.resolveModel(modelName);
  }

  private resolveProviderForModel(modelName: string): string {
    const lowerModel = modelName.toLowerCase();
    const prefix = Object.keys(MODEL_PROVIDER_PREFIX).find((p) =>
      lowerModel.startsWith(p),
    );
    return prefix ? MODEL_PROVIDER_PREFIX[prefix] : "openai";
  }

  private assertKey(
    apiKey: string | undefined,
    envName: string,
  ): asserts apiKey is string {
    if (!apiKey) {
      throw new Error(`${envName} is required for AI provider initialization`);
    }
  }
}
