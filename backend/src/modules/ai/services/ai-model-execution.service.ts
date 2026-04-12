import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { google } from "@ai-sdk/google";
import { openai } from "@ai-sdk/openai";
import { generateText, Output, stepCountIs, tool, type ToolChoice, type ToolSet } from "ai";
import { z } from "zod";
import type { OpenAiResponseTelemetry } from "../interfaces/agent.interface";
import type { StartupStage } from "../../startup/entities/startup.schema";
import type { AiPromptKey } from "./ai-prompt-catalog";
import {
  isOpenAiStandardModel,
  isResearchPromptKey,
} from "./ai-runtime-config.schema";
import {
  AiModelConfigService,
  type ResolvedModelConfig,
} from "./ai-model-config.service";
import { AiProviderService } from "../providers/ai-provider.service";
import { BraveSearchService } from "./brave-search.service";
import {
  OpenAiTextGenerationService,
  type OpenAiTextGenerationResult,
} from "./openai-text-generation.service";

type GenerateTextCall = Parameters<typeof generateText>[0];
type GenerateTextResult = Awaited<ReturnType<typeof generateText>>;
type GenerateTextProviderOptions = GenerateTextCall["providerOptions"];
type GenerateTextOutput = GenerateTextCall["output"];

type NormalizedGenerateTextResult<TOutput = unknown> = Pick<
  GenerateTextResult,
  "text" | "sources"
> & {
  output: TOutput | undefined;
  experimental_output: TOutput | undefined;
  telemetry?: OpenAiResponseTelemetry;
};

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
  braveSearchFn?: (
    query: string,
    count?: number,
  ) => Promise<{
    query: string;
    results: Array<{
      title: string;
      url: string;
      description: string;
      age?: string;
    }>;
  }>;
}

@Injectable()
export class AiModelExecutionService {
  constructor(
    private modelConfig: AiModelConfigService,
    private providers: AiProviderService,
    private braveSearch: BraveSearchService,
    private openAiTextGeneration: OpenAiTextGenerationService,
  ) {}

  async generateText<TOutput = unknown>(params: {
    model: GenerateTextCall["model"];
    system?: string;
    prompt: string;
    schema?: z.ZodTypeAny;
    output?: GenerateTextOutput;
    temperature?: number;
    maxOutputTokens?: number;
    tools?: ToolSet;
    toolChoice?: ToolChoice<ToolSet>;
    providerOptions?: GenerateTextProviderOptions;
    abortSignal?: AbortSignal;
  }): Promise<NormalizedGenerateTextResult<TOutput>> {
    const modelName = this.getModelName(params.model);

    if (isOpenAiStandardModel(modelName)) {
      const nativeResult = await this.openAiTextGeneration.generate<TOutput>({
        modelName,
        system: params.system,
        prompt: params.prompt,
        schema: params.schema,
        temperature: params.temperature,
        maxOutputTokens: params.maxOutputTokens,
        reasoningEffort: this.extractReasoningEffort(params.providerOptions),
        tools: params.tools,
        toolChoice: params.toolChoice,
        maxToolRoundtrips: this.extractMaxToolRoundtrips(params.tools, params.toolChoice),
        abortSignal: params.abortSignal,
      });

      return this.normalizeOpenAiResult(nativeResult);
    }

    const response = await generateText({
      model: params.model,
      system: params.system,
      prompt: params.prompt,
      ...(params.output ? { output: params.output } : params.schema ? { output: Output.object({ schema: params.schema }) } : {}),
      temperature: params.temperature,
      maxOutputTokens: params.maxOutputTokens,
      tools: params.tools,
      toolChoice: params.toolChoice,
      providerOptions: params.providerOptions,
      abortSignal: params.abortSignal,
    });

    return {
      text: response.text,
      output: response.output as TOutput | undefined,
      experimental_output: response.experimental_output as TOutput | undefined,
      sources: response.sources,
    };
  }

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
        braveSearchFn: undefined,
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

    const braveSearchFn = requiresBraveToolCall
      ? async (query: string, count?: number) => {
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
        }
      : undefined;

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
      braveSearchFn,
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
        strictJsonSchema: false,
      },
    };
  }

  private getModelName(model: GenerateTextCall["model"]): string {
    if (typeof model === "string") {
      return model;
    }

    const candidate = model as { modelId?: string };
    if (typeof candidate.modelId === "string" && candidate.modelId.length > 0) {
      return candidate.modelId;
    }

    throw new Error("Unable to resolve model name for AI execution");
  }

  private extractReasoningEffort(
    providerOptions: GenerateTextProviderOptions | undefined,
  ): "low" | "medium" | "high" | undefined {
    const effort = (providerOptions as { openai?: { reasoningEffort?: string } } | undefined)
      ?.openai?.reasoningEffort;
    return effort === "low" || effort === "medium" || effort === "high"
      ? effort
      : undefined;
  }

  private extractMaxToolRoundtrips(
    tools: ToolSet | undefined,
    toolChoice: ToolChoice<ToolSet> | undefined,
  ): number | undefined {
    if (!tools || Object.keys(tools).length === 0) {
      return undefined;
    }
    if (toolChoice === "auto") {
      return 4;
    }
    return 6;
  }

  private normalizeOpenAiResult<TOutput>(
    result: OpenAiTextGenerationResult<TOutput>,
  ): NormalizedGenerateTextResult<TOutput> {
    return {
      text: result.text,
      output: result.output,
      experimental_output: result.experimental_output,
      sources: result.sources as GenerateTextResult["sources"],
      telemetry: result.telemetry,
    };
  }
}
