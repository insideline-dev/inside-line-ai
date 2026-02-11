import { Injectable, Logger } from "@nestjs/common";
import { google } from "@ai-sdk/google";
import { generateText } from "ai";
import { z } from "zod";
import { INTERNAL_PIPELINE_SOURCE } from "../agents/evaluation/evaluation-utils";
import type { ResearchAgentKey } from "../interfaces/agent.interface";
import type { SourceEntry } from "../interfaces/phase-results.interface";
import { ModelPurpose } from "../interfaces/pipeline.interface";
import { AiProviderService } from "../providers/ai-provider.service";
import { AiConfigService } from "./ai-config.service";

interface ResearchRequest<TOutput extends { sources: string[] }> {
  agent: ResearchAgentKey;
  prompt: string;
  systemPrompt: string;
  schema: z.ZodSchema<TOutput>;
  fallback: () => TOutput;
}

interface ResearchResponse<TOutput extends { sources: string[] }> {
  output: TOutput;
  sources: SourceEntry[];
  usedFallback: boolean;
  error?: string;
}

@Injectable()
export class GeminiResearchService {
  private readonly logger = new Logger(GeminiResearchService.name);

  constructor(
    private providers: AiProviderService,
    private aiConfig: AiConfigService,
  ) {}

  async research<TOutput extends { sources: string[] }>(
    request: ResearchRequest<TOutput>,
  ): Promise<ResearchResponse<TOutput>> {
    const fallback = request.fallback();

    try {
      const modelName = this.aiConfig.getModelForPurpose(ModelPurpose.RESEARCH);
      const model = this.providers.resolveModelForPurpose(ModelPurpose.RESEARCH);
      const canUseGoogleSearchTool = this.isGeminiModel(modelName);

      const response = await generateText({
        model,
        system: request.systemPrompt,
        prompt: request.prompt,
        tools: canUseGoogleSearchTool
          ? {
              google_search: google.tools.googleSearch({}),
            }
          : undefined,
        temperature: this.aiConfig.getResearchTemperature(),
      });

      const extractedSources = this.extractSources(response, request.agent);
      const sourceUrls = extractedSources
        .map((entry) => entry.url)
        .filter((url): url is string => Boolean(url));

      const parsed = this.parseTextToObject(response.text, request.schema);
      if (!parsed.success) {
        const fallbackSources = Array.isArray(fallback.sources) ? fallback.sources : [];
        return {
          output: {
            ...fallback,
            sources: this.mergeSourceUrls(fallbackSources, sourceUrls),
          },
          sources: extractedSources,
          usedFallback: true,
          error: parsed.error,
        };
      }

      return {
        output: {
          ...parsed.data,
          sources: this.mergeSourceUrls(parsed.data.sources, sourceUrls),
        },
        sources: extractedSources,
        usedFallback: false,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const modelName = this.aiConfig.getModelForPurpose(ModelPurpose.RESEARCH);
      const promptSize = request.prompt.length + request.systemPrompt.length;

      this.logger.warn(
        `Research agent ${request.agent} failed (model: ${modelName}, prompt size: ${promptSize}), using fallback: ${message}`,
      );

      return {
        output: fallback,
        sources: this.toInternalSource(request.agent),
        usedFallback: true,
        error: message,
      };
    }
  }

  private parseTextToObject<TOutput>(
    text: string,
    schema: z.ZodSchema<TOutput>,
  ): { success: true; data: TOutput } | { success: false; error: string } {
    const candidate = this.extractJsonCandidate(text);
    if (!candidate) {
      return {
        success: false,
        error: "Grounded response did not contain parseable JSON payload",
      };
    }

    const parsed = schema.safeParse(candidate);
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues[0]?.message ?? "Schema validation failed",
      };
    }

    return { success: true, data: parsed.data };
  }

  private extractJsonCandidate(text: string): unknown {
    const fencedMatch = text.match(/```json\s*([\s\S]*?)\s*```/i);
    if (fencedMatch?.[1]) {
      try {
        return JSON.parse(fencedMatch[1]);
      } catch {
        return null;
      }
    }

    const startIndex = text.indexOf("{");
    const endIndex = text.lastIndexOf("}");
    if (startIndex < 0 || endIndex <= startIndex) {
      return null;
    }

    try {
      const candidate = text.slice(startIndex, endIndex + 1);
      const parsed = JSON.parse(candidate);
      if (typeof parsed !== "object" || Array.isArray(parsed) || parsed === null) {
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }

  private mergeSourceUrls(
    existing: string[],
    extracted: string[],
  ): string[] {
    return [...new Set([...existing, ...extracted])];
  }

  private extractSources(
    response: {
      sources?: Array<{ title?: string; url?: string }>;
      providerMetadata?: unknown;
      experimental_providerMetadata?: unknown;
    },
    agent: ResearchAgentKey,
  ): SourceEntry[] {
    const dedupe = new Map<string, SourceEntry>();

    const addSource = (url: string | undefined, name: string) => {
      if (!url) {
        return;
      }

      const key = url;
      if (dedupe.has(key)) {
        return;
      }

      dedupe.set(key, {
        name,
        url,
        type: "search",
        agent,
        timestamp: new Date().toISOString(),
      });
    };

    for (const source of response.sources ?? []) {
      addSource(source.url, source.title ?? "Search source");
    }

    const providerMetadata =
      this.asRecord(response.providerMetadata)?.google ??
      this.asRecord(response.experimental_providerMetadata)?.google;

    const groundingMetadata = this.asRecord(providerMetadata)?.groundingMetadata;
    const chunks = this.asRecord(groundingMetadata)?.groundingChunks;

    if (Array.isArray(chunks)) {
      for (const chunk of chunks) {
        const web = this.asRecord(chunk)?.web;
        const url = this.readString(this.asRecord(web)?.uri);
        const title = this.readString(this.asRecord(web)?.title);
        addSource(url, title ?? "Grounding source");
      }
    }

    return Array.from(dedupe.values());
  }

  private toInternalSource(agent: ResearchAgentKey): SourceEntry[] {
    return [
      {
        name: "internal pipeline context",
        url: INTERNAL_PIPELINE_SOURCE,
        type: "document",
        agent,
        timestamp: new Date().toISOString(),
      },
    ];
  }

  private asRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== "object") {
      return null;
    }

    return value as Record<string, unknown>;
  }

  private readString(value: unknown): string | undefined {
    return typeof value === "string" && value.length > 0 ? value : undefined;
  }

  private isGeminiModel(modelName: string): boolean {
    return modelName.toLowerCase().startsWith("gemini");
  }
}
