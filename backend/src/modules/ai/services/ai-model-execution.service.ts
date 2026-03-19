import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { google } from "@ai-sdk/google";
import { openai } from "@ai-sdk/openai";
import { stepCountIs, tool, type ToolSet, type generateText } from "ai";
import { z } from "zod";
import type { StartupStage } from "../../startup/entities/startup.schema";
import type { AiPromptKey } from "./ai-prompt-catalog";
import { isResearchPromptKey } from "./ai-runtime-config.schema";
import {
  AiModelConfigService,
  type ResolvedModelConfig,
} from "./ai-model-config.service";
import { AiProviderService } from "../providers/ai-provider.service";
import { BraveSearchService } from "./brave-search.service";

type GenerateTextCall = Parameters<typeof generateText>[0];
type GenerateTextProviderOptions = GenerateTextCall["providerOptions"];

export interface ModelExecutionResolution {
  resolvedConfig: ResolvedModelConfig;
  generateTextOptions: Pick<
    GenerateTextCall,
    "model" | "tools" | "toolChoice" | "stopWhen" | "providerOptions"
  >;
  searchEnforcement: {
    requiresProviderEvidence: boolean;
    requiresBraveToolCall: boolean;
  };
  usage: {
    getBraveToolCallCount: () => number;
  };
}

@Injectable()
export class AiModelExecutionService {
  constructor(
    private modelConfig: AiModelConfigService,
    private providers: AiProviderService,
    private braveSearch: BraveSearchService,
  ) {}

  async resolveForPrompt(params: {
    key: AiPromptKey;
    stage?: StartupStage | string | null;
    revisionId?: string;
    enableWebSearch?: boolean;
    enableBraveSearch?: boolean;
  }): Promise<ModelExecutionResolution> {
    const resolvedConfig = await this.modelConfig.resolveConfig({
      key: params.key,
      stage: params.stage,
      enableWebSearch: params.enableWebSearch || params.enableBraveSearch,
    });
    const model = this.providers.resolveModel(resolvedConfig.modelName) as GenerateTextCall["model"];
    const providerOptions = this.resolveProviderOptions(resolvedConfig.provider);

    const isResearchKey = isResearchPromptKey(params.key);
    const needsSearchTools = isResearchKey || params.enableWebSearch === true || params.enableBraveSearch === true;

    // For eval agents, derive search needs directly from the per-agent toggles
    const isEvalSearch = !isResearchKey && needsSearchTools;
    const requiresProviderEvidence = isEvalSearch
      ? params.enableWebSearch === true
      : needsSearchTools &&
        (resolvedConfig.searchMode === "provider_grounded_search" ||
          resolvedConfig.searchMode === "provider_and_brave_search");
    const requiresBraveToolCall = isEvalSearch
      ? params.enableBraveSearch === true
      : needsSearchTools &&
        (resolvedConfig.searchMode === "brave_tool_search" ||
          resolvedConfig.searchMode === "provider_and_brave_search");

    if (!requiresProviderEvidence && !requiresBraveToolCall) {
      return {
        resolvedConfig,
        generateTextOptions: {
          model,
          tools: undefined,
          toolChoice: undefined,
          stopWhen: undefined,
          providerOptions,
        },
        searchEnforcement: {
          requiresProviderEvidence,
          requiresBraveToolCall,
        },
        usage: {
          getBraveToolCallCount: () => 0,
        },
      };
    }

    if (requiresBraveToolCall && !this.braveSearch.isConfigured()) {
      throw new ServiceUnavailableException(
        "Brave Search API key is not configured",
      );
    }

    const braveUsage = { calls: 0 };

    const tools: ToolSet = {};
    if (requiresProviderEvidence) {
      if (resolvedConfig.provider === "google") {
        tools.google_search = google.tools.googleSearch({});
      } else {
        tools.web_search = openai.tools.webSearch({});
      }
    }

    if (requiresBraveToolCall) {
      tools.brave_search = tool({
        description:
          "Search the public web with Brave Search when researching startups.",
        inputSchema: z.object({
          query: z.string().min(2),
          count: z.number().int().min(1).max(10).optional(),
        }),
        execute: async ({ query, count }) => {
          braveUsage.calls += 1;
          const result = await this.braveSearch.search(query, { count });

          return {
            query: result.query,
            results: result.results.map((item) => ({
              title: item.title,
              url: item.url,
              description: item.description,
              age: item.age,
            })),
          };
        },
      });
    }

    // Eval agents use "auto" tool choice (optional search), research agents use "required"
    const isEvalWebSearch = params.enableWebSearch === true && !isResearchKey;
    const toolChoice = isEvalWebSearch ? ("auto" as const) : ("required" as const);
    const stopWhen = isEvalWebSearch
      ? stepCountIs(4)
      : stepCountIs(requiresProviderEvidence && requiresBraveToolCall ? 8 : 6);

    return {
      resolvedConfig,
      generateTextOptions: {
        model,
        tools,
        toolChoice,
        stopWhen,
        providerOptions,
      },
      searchEnforcement: {
        requiresProviderEvidence,
        requiresBraveToolCall,
      },
      usage: {
        getBraveToolCallCount: () => braveUsage.calls,
      },
    };
  }

  private resolveProviderOptions(
    provider: ResolvedModelConfig["provider"],
  ): GenerateTextProviderOptions | undefined {
    if (provider !== "openai") {
      return undefined;
    }

    return {
      openai: {
        reasoningEffort: "high",
      },
    };
  }
}
