import { Injectable, Logger } from "@nestjs/common";
import { StartupStage } from "../../startup/entities/startup.schema";
import { type AiPromptKey } from "./ai-prompt-catalog";
import {
  isOpenAiDeepResearchModel,
  isResearchPromptKey,
  resolveModelPurposeForPromptKey,
  resolveProviderForModelName,
  type AiRuntimeSearchMode,
} from "./ai-runtime-config.schema";
import { AiConfigService } from "./ai-config.service";
import { AiModelOverrideService } from "./ai-model-override.service";
import type { ModelPurpose } from "../interfaces/pipeline.interface";

export interface ResolvedModelConfig {
  source: "default" | "override";
  revisionId: null;
  stage: StartupStage | null;
  purpose: ModelPurpose;
  modelName: string;
  provider: string;
  searchMode: AiRuntimeSearchMode;
  supportedSearchModes: AiRuntimeSearchMode[];
}

@Injectable()
export class AiModelConfigService {
  private readonly logger = new Logger(AiModelConfigService.name);

  constructor(
    private aiConfig: AiConfigService,
    private overrideService: AiModelOverrideService,
  ) {}

  async resolveConfig(params: {
    key: AiPromptKey;
    stage?: StartupStage | string | null;
    enableWebSearch?: boolean;
  }): Promise<ResolvedModelConfig> {
    const normalizedStage = this.normalizeStage(params.stage);
    const purpose = resolveModelPurposeForPromptKey(params.key);

    const override = await this.overrideService.getByPurpose(purpose);
    if (override) {
      return this.buildOverrideResolvedConfig(
        params.key,
        normalizedStage,
        purpose,
        override.modelName,
        override.searchMode,
        params.enableWebSearch,
      );
    }

    return this.buildDefaultResolvedConfig(params.key, normalizedStage, purpose, params.enableWebSearch);
  }

  private buildDefaultResolvedConfig(
    key: AiPromptKey,
    stage: StartupStage | null,
    purpose: ModelPurpose,
    enableWebSearch?: boolean,
  ): ResolvedModelConfig {
    const modelName = this.aiConfig.getModelForPurpose(purpose);
    const provider = resolveProviderForModelName(modelName);
    const supportedSearchModes = this.getSupportedSearchModes(key, provider, modelName, enableWebSearch);

    return {
      source: "default",
      revisionId: null,
      stage,
      purpose,
      modelName,
      provider,
      searchMode: supportedSearchModes.includes("provider_grounded_search")
        ? "provider_grounded_search"
        : supportedSearchModes.includes("brave_tool_search")
          ? "brave_tool_search"
          : "off",
      supportedSearchModes,
    };
  }

  private buildOverrideResolvedConfig(
    key: AiPromptKey,
    stage: StartupStage | null,
    purpose: ModelPurpose,
    modelName: string,
    searchModeOverride: string | null,
    enableWebSearch?: boolean,
  ): ResolvedModelConfig {
    const provider = resolveProviderForModelName(modelName);
    const supportedSearchModes = this.getSupportedSearchModes(key, provider, modelName, enableWebSearch);

    const searchMode: AiRuntimeSearchMode =
      searchModeOverride && supportedSearchModes.includes(searchModeOverride as AiRuntimeSearchMode)
        ? searchModeOverride as AiRuntimeSearchMode
        : supportedSearchModes.includes("provider_grounded_search")
          ? "provider_grounded_search"
          : supportedSearchModes.includes("brave_tool_search")
            ? "brave_tool_search"
            : "off";

    return {
      source: "override",
      revisionId: null,
      stage,
      purpose,
      modelName,
      provider,
      searchMode,
      supportedSearchModes,
    };
  }

  private getSupportedSearchModes(
    key: AiPromptKey,
    provider: string,
    modelName: string,
    enableWebSearch?: boolean,
  ): AiRuntimeSearchMode[] {
    if (isResearchPromptKey(key)) {
      if (isOpenAiDeepResearchModel(modelName)) {
        return ["off", "provider_grounded_search"];
      }

      if (provider === "google" || provider === "openai") {
        return [
          "off",
          "provider_grounded_search",
          "brave_tool_search",
          "provider_and_brave_search",
        ];
      }

      return ["off", "brave_tool_search"];
    }

    if (enableWebSearch === true) {
      if (provider === "google" || provider === "openai") {
        return [
          "off",
          "provider_grounded_search",
          "brave_tool_search",
          "provider_and_brave_search",
        ];
      }

      return ["off", "brave_tool_search"];
    }

    return ["off"];
  }

  private normalizeStage(
    value?: StartupStage | string | null,
  ): StartupStage | null {
    if (!value) {
      return null;
    }

    const normalized = String(value).trim().toLowerCase().replace(/-/g, "_");
    if (Object.values(StartupStage).includes(normalized as StartupStage)) {
      return normalized as StartupStage;
    }

    return null;
  }

}
