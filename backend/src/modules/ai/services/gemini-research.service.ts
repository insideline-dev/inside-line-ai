import { Injectable, Logger } from "@nestjs/common";
import { generateText, Output } from "ai";
import { z } from "zod";
import { INTERNAL_PIPELINE_SOURCE } from "../agents/evaluation/evaluation-utils";
import type { ResearchAgentKey } from "../interfaces/agent.interface";
import type { SourceEntry } from "../interfaces/phase-results.interface";
import { ModelPurpose } from "../interfaces/pipeline.interface";
import { AiProviderService } from "../providers/ai-provider.service";
import { AiConfigService } from "./ai-config.service";

interface ResearchRequest<TOutput extends { sources: string[] }> {
  agent: ResearchAgentKey;
  modelName?: string;
  model?: GenerateTextModel;
  tools?: GenerateTextTools;
  toolChoice?: GenerateTextToolChoice;
  stopWhen?: GenerateTextStopWhen;
  searchEnforcement?: {
    requiresProviderEvidence: boolean;
    requiresBraveToolCall: boolean;
  };
  getBraveToolCallCount?: () => number;
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
  outputText?: string;
  attempt: number;
  retryCount: number;
}

interface SourceCarrier {
  sources?: Array<{ title?: string; url?: string }>;
  providerMetadata?: unknown;
  experimental_providerMetadata?: unknown;
}

type GenerateTextModel = Parameters<typeof generateText>[0]["model"];
type GenerateTextTools = Parameters<typeof generateText>[0]["tools"];
type GenerateTextToolChoice = Parameters<typeof generateText>[0]["toolChoice"];
type GenerateTextStopWhen = Parameters<typeof generateText>[0]["stopWhen"];

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
    const modelName =
      request.modelName ?? this.aiConfig.getModelForPurpose(ModelPurpose.RESEARCH);
    const model =
      request.model ??
      (this.providers.resolveModelForPurpose(
        ModelPurpose.RESEARCH,
      ) as GenerateTextModel);
    const maxAttempts = this.getResearchMaxAttempts();
    const hardTimeoutMs = this.getResearchAgentHardTimeoutMs();
    const startedAt = Date.now();
    let lastError = "Unknown research error";

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const remainingBudgetMs = this.getRemainingBudgetMs(
        startedAt,
        hardTimeoutMs,
      );
      if (remainingBudgetMs <= 0) {
        lastError = `Research agent ${request.agent} exceeded hard timeout`;
        break;
      }
      const attemptTimeoutMs = this.getAttemptTimeoutMs(remainingBudgetMs);
      const structured = await this.tryStructuredAttempt({
        agent: request.agent,
        model,
        prompt: request.prompt,
        systemPrompt: request.systemPrompt,
        schema: request.schema,
        tools: request.tools,
        toolChoice: request.toolChoice,
        stopWhen: request.stopWhen,
        timeoutMs: attemptTimeoutMs,
      });
      if (structured.success) {
        const enforcementError = this.validateSearchEnforcement({
          sourceCount: structured.sources.length,
          searchEnforcement: request.searchEnforcement,
          braveToolCallCount: request.getBraveToolCallCount?.() ?? 0,
        });
        if (enforcementError) {
          lastError = enforcementError;
          if (attempt < maxAttempts) {
            const delayMs = Math.min(
              this.getRetryDelayMs(attempt),
              Math.max(0, this.getRemainingBudgetMs(startedAt, hardTimeoutMs) - 50),
            );
            if (delayMs <= 0) {
              lastError = `Research agent ${request.agent} exceeded hard timeout`;
              break;
            }
            this.logger.warn(
              `Research agent ${request.agent} attempt ${attempt}/${maxAttempts} missing required search evidence, retrying in ${delayMs}ms: ${enforcementError}`,
            );
            await this.sleep(delayMs);
            continue;
          }

          const fallbackSources = Array.isArray(fallback.sources)
            ? fallback.sources
            : [];
          return {
            output: {
              ...fallback,
              sources: this.mergeSourceUrls(
                fallbackSources,
                this.extractSourceUrls(structured.sources),
              ),
            },
            sources:
              structured.sources.length > 0
                ? structured.sources
                : this.toInternalSource(request.agent),
            usedFallback: true,
            error: enforcementError,
            outputText: structured.outputText,
            attempt,
            retryCount: Math.max(0, attempt - 1),
          };
        } else {
        return {
          output: {
            ...structured.data,
            sources: this.mergeSourceUrls(
              structured.data.sources,
              structured.sourceUrls,
            ),
          },
          sources: structured.sources,
          usedFallback: false,
          outputText: structured.outputText,
          attempt,
          retryCount: Math.max(0, attempt - 1),
        };
        }
      }

      const text = await this.tryTextAttempt({
        agent: request.agent,
        model,
        prompt: request.prompt,
        systemPrompt: request.systemPrompt,
        schema: request.schema,
        tools: request.tools,
        toolChoice: request.toolChoice,
        stopWhen: request.stopWhen,
        timeoutMs: attemptTimeoutMs,
      });
      if (text.success) {
        const enforcementError = this.validateSearchEnforcement({
          sourceCount: text.sources.length,
          searchEnforcement: request.searchEnforcement,
          braveToolCallCount: request.getBraveToolCallCount?.() ?? 0,
        });
        if (enforcementError) {
          lastError = enforcementError;
          if (attempt < maxAttempts) {
            const delayMs = Math.min(
              this.getRetryDelayMs(attempt),
              Math.max(0, this.getRemainingBudgetMs(startedAt, hardTimeoutMs) - 50),
            );
            if (delayMs <= 0) {
              lastError = `Research agent ${request.agent} exceeded hard timeout`;
              break;
            }
            this.logger.warn(
              `Research agent ${request.agent} attempt ${attempt}/${maxAttempts} missing required search evidence, retrying in ${delayMs}ms: ${enforcementError}`,
            );
            await this.sleep(delayMs);
            continue;
          }

          const fallbackSources = Array.isArray(fallback.sources)
            ? fallback.sources
            : [];
          return {
            output: {
              ...fallback,
              sources: this.mergeSourceUrls(
                fallbackSources,
                this.extractSourceUrls(text.sources),
              ),
            },
            sources:
              text.sources.length > 0
                ? text.sources
                : this.toInternalSource(request.agent),
            usedFallback: true,
            error: enforcementError,
            outputText: text.outputText,
            attempt,
            retryCount: Math.max(0, attempt - 1),
          };
        } else {
        return {
          output: {
            ...text.data,
            sources: this.mergeSourceUrls(text.data.sources, text.sourceUrls),
          },
          sources: text.sources,
          usedFallback: false,
          outputText: text.outputText,
          attempt,
          retryCount: Math.max(0, attempt - 1),
        };
        }
      }

      const errorMessage = this.joinErrorMessages(structured.error, text.error);
      lastError = errorMessage;
      const shouldRetry =
        attempt < maxAttempts &&
        (structured.retryable || text.retryable || this.isRetryableParseError(errorMessage));
      if (shouldRetry) {
        const delayMs = Math.min(
          this.getRetryDelayMs(attempt),
          Math.max(0, this.getRemainingBudgetMs(startedAt, hardTimeoutMs) - 50),
        );
        if (delayMs <= 0) {
          lastError = `Research agent ${request.agent} exceeded hard timeout`;
          break;
        }
        this.logger.warn(
          `Research agent ${request.agent} attempt ${attempt}/${maxAttempts} failed, retrying in ${delayMs}ms: ${errorMessage}`,
        );
        await this.sleep(delayMs);
        continue;
      }

      const promptSize = request.prompt.length + request.systemPrompt.length;
      const mergedSources = this.mergeSourceEntries(structured.sources, text.sources);
      const sourceUrls = this.mergeSourceUrls(
        this.extractSourceUrls(structured.sources),
        this.extractSourceUrls(text.sources),
      );
      const fallbackSources = Array.isArray(fallback.sources) ? fallback.sources : [];
      this.logger.warn(
        `Research agent ${request.agent} failed (model: ${modelName}, prompt size: ${promptSize}), using fallback: ${errorMessage}`,
      );
      return {
        output: {
          ...fallback,
          sources: this.mergeSourceUrls(fallbackSources, sourceUrls),
        },
        sources: mergedSources.length > 0 ? mergedSources : this.toInternalSource(request.agent),
        usedFallback: true,
        error: errorMessage,
        outputText: text.outputText ?? structured.outputText,
        attempt,
        retryCount: Math.max(0, attempt - 1),
      };
    }

    return {
      output: fallback,
      sources: this.toInternalSource(request.agent),
      usedFallback: true,
      error: lastError,
      attempt: maxAttempts,
      retryCount: Math.max(0, maxAttempts - 1),
    };
  }

  private async tryStructuredAttempt<TOutput extends { sources: string[] }>(input: {
    agent: ResearchAgentKey;
    model: GenerateTextModel;
    prompt: string;
    systemPrompt: string;
    schema: z.ZodSchema<TOutput>;
    tools?: GenerateTextTools;
    toolChoice?: GenerateTextToolChoice;
    stopWhen?: GenerateTextStopWhen;
    timeoutMs: number;
  }): Promise<
    | {
        success: true;
        data: TOutput;
        sources: SourceEntry[];
        sourceUrls: string[];
        outputText: string;
      }
    | {
        success: false;
        error: string;
        retryable: boolean;
        sources: SourceEntry[];
        outputText?: string;
      }
  > {
    try {
      const response = await this.withTimeout(
        generateText({
          model: input.model,
          system: input.systemPrompt,
          prompt: input.prompt,
          output: Output.object({ schema: input.schema }),
          tools: input.tools,
          toolChoice: input.toolChoice,
          stopWhen: input.stopWhen,
          temperature: this.aiConfig.getResearchTemperature(),
        }),
        input.timeoutMs,
        `Research agent ${input.agent} timed out`,
      );

      const parsed = input.schema.safeParse(response.output);
      if (!parsed.success) {
        const textFallback = this.parseTextToObject(
          this.resolveRawOutputText(response, undefined),
          input.schema,
        );
        if (textFallback.success) {
          const sources = this.extractSources(response as SourceCarrier, input.agent);
          return {
            success: true,
            data: textFallback.data,
            sources,
            sourceUrls: this.extractSourceUrls(sources),
            outputText: this.resolveRawOutputText(response, textFallback.data),
          };
        }

        const schemaError = this.formatSchemaIssues(parsed.error);
        const error = schemaError.length > 0
          ? `Schema validation failed: ${schemaError}; ${textFallback.error}`
          : `Schema validation failed: ${textFallback.error}`;
        return {
          success: false,
          error,
          retryable: true,
          sources: this.extractSources(response as SourceCarrier, input.agent),
          outputText: this.resolveRawOutputText(response, response.output),
        };
      }

      const sources = this.extractSources(response as SourceCarrier, input.agent);
      return {
        success: true,
        data: parsed.data,
        sources,
        sourceUrls: this.extractSourceUrls(sources),
        outputText: this.resolveRawOutputText(response, parsed.data),
      };
    } catch (error) {
      const message = this.errorMessage(error);
      return {
        success: false,
        error: message,
        retryable:
          this.isRetryableError(message) ||
          this.isRetryableParseError(message) ||
          this.isNoStructuredOutputError(message),
        sources: [],
      };
    }
  }

  private async tryTextAttempt<TOutput>(input: {
    agent: ResearchAgentKey;
    model: GenerateTextModel;
    prompt: string;
    systemPrompt: string;
    schema: z.ZodSchema<TOutput>;
    tools?: GenerateTextTools;
    toolChoice?: GenerateTextToolChoice;
    stopWhen?: GenerateTextStopWhen;
    timeoutMs: number;
  }): Promise<
    | {
        success: true;
        data: TOutput;
        sources: SourceEntry[];
        sourceUrls: string[];
        outputText: string;
      }
    | {
        success: false;
        error: string;
        retryable: boolean;
        sources: SourceEntry[];
        outputText?: string;
      }
  > {
    try {
      const response = await this.withTimeout(
        generateText({
          model: input.model,
          system: input.systemPrompt,
          prompt: input.prompt,
          tools: input.tools,
          toolChoice: input.toolChoice,
          stopWhen: input.stopWhen,
          temperature: this.aiConfig.getResearchTemperature(),
        }),
        input.timeoutMs,
        `Research agent ${input.agent} timed out`,
      );

      const responseRecord = (response ?? {}) as SourceCarrier & { text?: string };
      const outputText = this.resolveRawOutputText(responseRecord, undefined);
      const parsed = this.parseTextToObject(outputText, input.schema);
      if (!parsed.success) {
        return {
          success: false,
          error: parsed.error,
          retryable: this.isRetryableParseError(parsed.error),
          sources: this.extractSources(responseRecord, input.agent),
          outputText,
        };
      }

      const sources = this.extractSources(responseRecord, input.agent);
      return {
        success: true,
        data: parsed.data,
        sources,
        sourceUrls: this.extractSourceUrls(sources),
        outputText,
      };
    } catch (error) {
      const message = this.errorMessage(error);
      return {
        success: false,
        error: message,
        retryable: this.isRetryableError(message),
        sources: [],
      };
    }
  }

  private getRetryDelayMs(attempt: number): number {
    const baseMs = 750 * 2 ** Math.max(0, attempt - 1);
    const jitter = Math.floor(Math.random() * 250);
    return baseMs + jitter;
  }

  private isRetryableError(message: string): boolean {
    const normalized = message.toLowerCase();
    const retryablePatterns = [
      "timed out",
      "timeout",
      "rate limit",
      "429",
      "503",
      "502",
      "network",
      "connection",
      "socket",
      "temporarily unavailable",
    ];
    return retryablePatterns.some((pattern) => normalized.includes(pattern));
  }

  private isRetryableParseError(message: string): boolean {
    const normalized = message.toLowerCase();
    return (
      normalized.includes("schema validation failed") ||
      normalized.includes("parseable json payload") ||
      normalized.includes("no output generated") ||
      normalized.includes("no object generated")
    );
  }

  private isNoStructuredOutputError(message: string): boolean {
    const normalized = message.toLowerCase();
    return (
      normalized.includes("no output generated") ||
      normalized.includes("no object generated") ||
      normalized.includes("empty response")
    );
  }

  private validateSearchEnforcement(input: {
    sourceCount: number;
    searchEnforcement?: {
      requiresProviderEvidence: boolean;
      requiresBraveToolCall: boolean;
    };
    braveToolCallCount: number;
  }): string | null {
    const enforcement = input.searchEnforcement;
    if (!enforcement) {
      return null;
    }

    if (enforcement.requiresProviderEvidence && input.sourceCount === 0) {
      return "Provider search evidence is required but no grounded sources were returned";
    }

    if (enforcement.requiresBraveToolCall && input.braveToolCallCount <= 0) {
      // Gemini provider-grounded search can return grounded sources without invoking
      // the custom Brave tool callback. Avoid rejecting valid grounded outputs in that case.
      if (enforcement.requiresProviderEvidence && input.sourceCount > 0) {
        this.logger.warn(
          "Allowing grounded research result without explicit Brave tool callback because provider evidence was present",
        );
        return null;
      }
      return "Brave search tool usage is required but the tool was not called";
    }

    return null;
  }

  private async sleep(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
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
      const issues = this.formatSchemaIssues(parsed.error);
      return {
        success: false,
        error: issues.length > 0
          ? `Schema validation failed: ${issues}`
          : "Schema validation failed",
      };
    }

    return { success: true, data: parsed.data };
  }

  private extractJsonCandidate(text: string): unknown {
    const direct = this.tryParseJsonObject(text.trim());
    if (direct) {
      return direct;
    }

    const fencedMatches = text.matchAll(/```(?:json)?\s*([\s\S]*?)\s*```/gi);
    for (const match of fencedMatches) {
      if (!match[1]) {
        continue;
      }
      const parsed = this.tryParseJsonObject(match[1]);
      if (parsed) {
        return parsed;
      }
    }

    const unescapedQuoted = this.tryParseEscapedJsonString(text.trim());
    if (unescapedQuoted) {
      return unescapedQuoted;
    }

    for (const candidate of this.extractBalancedJsonObjects(text)) {
      const parsed = this.tryParseJsonObject(candidate);
      if (parsed) {
        return parsed;
      }
    }

    return null;
  }

  private tryParseEscapedJsonString(text: string): unknown {
    if (!text.startsWith("\"") || !text.endsWith("\"")) {
      return null;
    }

    try {
      const unescaped = JSON.parse(text);
      if (typeof unescaped !== "string") {
        return null;
      }
      return this.tryParseJsonObject(unescaped);
    } catch {
      return null;
    }
  }

  private tryParseJsonObject(text: string): unknown {
    if (!text) {
      return null;
    }

    try {
      const parsed = JSON.parse(text);
      if (typeof parsed !== "object" || Array.isArray(parsed) || parsed === null) {
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }

  private extractBalancedJsonObjects(text: string): string[] {
    const candidates: string[] = [];
    let start = -1;
    let depth = 0;
    let inString = false;
    let escaping = false;

    for (let index = 0; index < text.length; index += 1) {
      const char = text[index];

      if (escaping) {
        escaping = false;
        continue;
      }
      if (char === "\\") {
        escaping = true;
        continue;
      }
      if (char === "\"") {
        inString = !inString;
        continue;
      }
      if (inString) {
        continue;
      }
      if (char === "{") {
        if (depth === 0) {
          start = index;
        }
        depth += 1;
        continue;
      }
      if (char === "}" && depth > 0) {
        depth -= 1;
        if (depth === 0 && start >= 0) {
          candidates.push(text.slice(start, index + 1));
          start = -1;
        }
      }
    }

    return candidates;
  }

  private mergeSourceUrls(
    existing: string[],
    extracted: string[],
  ): string[] {
    return [...new Set([...existing, ...extracted])];
  }

  private formatSchemaIssues(error: z.ZodError): string {
    const preview = error.issues.slice(0, 6).map((issue) => {
      const path = issue.path.length > 0
        ? issue.path
            .map((segment) =>
              typeof segment === "number" ? `[${segment}]` : String(segment),
            )
            .join(".")
            .replace(".[", "[")
        : "(root)";
      return `${path}: ${issue.message}`;
    });

    if (preview.length === 0) {
      return "";
    }
    if (error.issues.length <= preview.length) {
      return preview.join(" | ");
    }
    return `${preview.join(" | ")} | +${error.issues.length - preview.length} more issue(s)`;
  }

  private extractSources(
    response: SourceCarrier,
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

  private extractSourceUrls(sources: SourceEntry[]): string[] {
    return sources
      .map((entry) => entry.url)
      .filter((url): url is string => Boolean(url));
  }

  private mergeSourceEntries(
    first: SourceEntry[],
    second: SourceEntry[],
  ): SourceEntry[] {
    const dedupe = new Map<string, SourceEntry>();
    for (const source of [...first, ...second]) {
      const key = source.url ?? `${source.agent}:${source.name}`;
      if (!dedupe.has(key)) {
        dedupe.set(key, source);
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

  private resolveRawOutputText(
    response: { text?: string },
    output?: unknown,
  ): string {
    if (typeof response.text === "string" && response.text.trim().length > 0) {
      return response.text;
    }
    if (output !== undefined) {
      return this.safeStringify(output);
    }
    return "";
  }

  private safeStringify(value: unknown): string {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  private joinErrorMessages(first: string, second: string): string {
    if (!first) {
      return second;
    }
    if (!second || first === second) {
      return first;
    }
    return `${first}; ${second}`;
  }

  private getAttemptTimeoutMs(remainingBudgetMs: number): number {
    const configuredAttemptTimeout = this.getResearchAttemptTimeoutMs();
    const boundedTimeout = Math.min(configuredAttemptTimeout, remainingBudgetMs);
    return Math.max(1, boundedTimeout);
  }

  private getRemainingBudgetMs(startedAt: number, hardTimeoutMs: number): number {
    if (!Number.isFinite(hardTimeoutMs) || hardTimeoutMs <= 0) {
      return Number.MAX_SAFE_INTEGER;
    }

    return hardTimeoutMs - (Date.now() - startedAt);
  }

  private getResearchAttemptTimeoutMs(): number {
    const config = this.aiConfig as Partial<AiConfigService> & {
      getResearchTimeoutMs?: () => number;
    };
    if (typeof config.getResearchAttemptTimeoutMs === "function") {
      return config.getResearchAttemptTimeoutMs();
    }
    if (typeof config.getResearchTimeoutMs === "function") {
      return config.getResearchTimeoutMs();
    }
    return 90_000;
  }

  private getResearchMaxAttempts(): number {
    const config = this.aiConfig as Partial<AiConfigService>;
    if (typeof config.getResearchMaxAttempts === "function") {
      return config.getResearchMaxAttempts();
    }
    return 3;
  }

  private getResearchAgentHardTimeoutMs(): number {
    const config = this.aiConfig as Partial<AiConfigService>;
    if (typeof config.getResearchAgentHardTimeoutMs === "function") {
      return config.getResearchAgentHardTimeoutMs();
    }
    return this.getResearchAttemptTimeoutMs() * this.getResearchMaxAttempts() + 30_000;
  }

  private async withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    message: string,
  ): Promise<T> {
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
      return promise;
    }

    return await new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(message)), timeoutMs);
      Promise.resolve(promise)
        .then((result) => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch((error) => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }
}
