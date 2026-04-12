import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import type { OpenAiResponseTelemetry } from "../interfaces/agent.interface";
import { RedisFallbackClient } from "./redis-fallback.service";

export interface OpenAiDirectCallInput<T> {
  modelName: string;
  system: string;
  prompt: string;
  schema: z.ZodType<T>;
  schemaName: string;
  temperature?: number;
  maxOutputTokens?: number;
  abortSignal?: AbortSignal;
  reasoningEffort?: "low" | "medium" | "high";
  /** When false, overrides zodTextFormat strict mode so the model can skip fields it has no data for.
   *  The caller's standard schema (with preprocessing/defaults) handles validation. */
  strict?: boolean;
  /** Unique key for response ID persistence (e.g. `startupId:agentKey`). Enables crash recovery. */
  jobKey?: string;
}

export interface OpenAiDirectCallResult<T> {
  output: T;
  rawText: string;
  usage?: { inputTokens: number; outputTokens: number };
  finishReason?: string;
  telemetry?: {
    provider: "openai";
    model?: string;
    responseId?: string;
    status?: string;
    finishReason?: string;
    startedAt?: string;
    completedAt?: string;
    durationMs?: number;
    usage?: {
      inputTokens?: number;
      outputTokens?: number;
      totalTokens?: number;
    };
    request?: Record<string, unknown>;
    response?: Record<string, unknown>;
    error?: Record<string, unknown>;
  };
}

export interface OpenAiDirectSubmission {
  responseId: string;
  resumed: boolean;
}

export interface OpenAiDirectPollResult {
  responseId: string;
  status: string;
  response: OpenAI.Responses.Response;
}

const POLL_INTERVAL_MS = 15_000;
const RESPONSE_ID_TTL_SECONDS = 30 * 60; // 30 min — enough for any eval agent
const REDIS_KEY_PREFIX = "openai:response:";

const TERMINAL_STATUSES = new Set([
  "completed",
  "failed",
  "cancelled",
  "incomplete",
]);

function toOpenAiUsage(
  usage:
    | OpenAI.Responses.ResponseUsage
    | { input_tokens?: number | null; output_tokens?: number | null; total_tokens?: number | null }
    | undefined,
): OpenAiResponseTelemetry["usage"] | undefined {
  if (!usage) {
    return undefined;
  }

  const inputTokens = usage.input_tokens ?? undefined;
  const outputTokens = usage.output_tokens ?? undefined;
  const totalTokens = usage.total_tokens ??
    (typeof inputTokens === "number" || typeof outputTokens === "number"
      ? (inputTokens ?? 0) + (outputTokens ?? 0)
      : undefined);

  if (
    typeof inputTokens !== "number" &&
    typeof outputTokens !== "number" &&
    typeof totalTokens !== "number"
  ) {
    return undefined;
  }

  return {
    inputTokens,
    outputTokens,
    totalTokens,
  };
}

function buildOpenAiTelemetry(input: {
  model: string;
  startedAt: Date;
  completedAt: Date;
  response: OpenAI.Responses.Response;
  finishReason?: string;
  request?: Record<string, unknown>;
  error?: Record<string, unknown>;
}): OpenAiResponseTelemetry {
  const { model, startedAt, completedAt, response, finishReason, request, error } = input;
  return {
    provider: "openai",
    model,
    responseId: response.id,
    status: typeof response.status === "string" ? response.status : undefined,
    finishReason,
    startedAt: startedAt.toISOString(),
    completedAt: completedAt.toISOString(),
    durationMs: completedAt.getTime() - startedAt.getTime(),
    usage: toOpenAiUsage(response.usage),
    request,
    response: {
      id: response.id,
      status: typeof response.status === "string" ? response.status : undefined,
      incompleteDetails:
        response.incomplete_details && typeof response.incomplete_details === "object"
          ? response.incomplete_details
          : undefined,
      outputItemCount: Array.isArray(response.output) ? response.output.length : undefined,
    },
    error,
  };
}

/**
 * Calls OpenAI Responses API directly (bypassing the Vercel AI SDK) for
 * structured output generation. Uses background mode + polling so that
 * hung HTTP connections can't block the worker indefinitely.
 *
 * When `jobKey` is provided, the OpenAI response ID is persisted to Redis.
 * If the worker crashes mid-poll, the next attempt resumes polling the
 * same response instead of creating a duplicate request.
 */
@Injectable()
export class OpenAiDirectClientService {
  private readonly logger = new Logger(OpenAiDirectClientService.name);
  private readonly client: OpenAI | null;
  private readonly redis: RedisFallbackClient;

  constructor(private readonly config: ConfigService) {
    const apiKey = this.config.get<string>("OPENAI_API_KEY");
    this.client = apiKey ? new OpenAI({ apiKey }) : null;
    if (!this.client) {
      this.logger.warn(
        "OpenAI direct client not configured — OPENAI_API_KEY missing. Agents will fall back to AI SDK.",
      );
    }
    this.redis = new RedisFallbackClient({
      redisUrl: this.config.get<string>("REDIS_URL", "redis://localhost:6379"),
      recoveryIntervalMs: 30_000,
      maxMemoryEntries: 200,
      loggerContext: "OpenAiDirectRedis",
    });
  }

  isConfigured(): boolean {
    return this.client !== null;
  }

  async submitStructured<T>(
    input: OpenAiDirectCallInput<T>,
  ): Promise<OpenAiDirectSubmission> {
    if (!this.client) {
      throw new Error(
        "OpenAI direct client not configured (missing OPENAI_API_KEY)",
      );
    }

    const redisKey = input.jobKey
      ? `${REDIS_KEY_PREFIX}${input.jobKey}`
      : undefined;
    const existingId = redisKey ? await this.redis.get(redisKey) : null;

    if (existingId) {
      this.logger.log(
        `[OpenAIDirect] Resuming existing response ${existingId} for key=${input.jobKey}`,
      );
      return {
        responseId: existingId,
        resumed: true,
      };
    }

    const created = await this.client.responses.create(
      this.buildCreateRequest(input),
    );
    if (redisKey) {
      await this.redis.set(redisKey, created.id, RESPONSE_ID_TTL_SECONDS);
    }
    this.logger.debug(
      `[OpenAIDirect] Created background response ${created.id} model=${input.modelName} key=${input.jobKey ?? "none"}`,
    );

    return {
      responseId: created.id,
      resumed: false,
    };
  }

  async pollResponse(
    responseId: string,
  ): Promise<OpenAiDirectPollResult> {
    if (!this.client) {
      throw new Error(
        "OpenAI direct client not configured (missing OPENAI_API_KEY)",
      );
    }

    const response = await this.client.responses.retrieve(responseId);
    return {
      responseId,
      status: response.status ?? "unknown",
      response,
    };
  }

  async parseStructuredResponse<T>(
    input: OpenAiDirectCallInput<T>,
    response: OpenAI.Responses.Response,
    responseId: string,
    startedAt: Date,
    completedAt: Date,
  ): Promise<OpenAiDirectCallResult<T>> {
    const status = response.status;
    const incompleteDetails = (response as { incomplete_details?: { reason?: string } }).incomplete_details;

    if (status === "incomplete") {
      const reason = incompleteDetails?.reason ?? "unknown";
      this.logger.warn(
        `[OpenAIDirect] Response ${responseId} incomplete: reason=${reason}. Attempting partial output recovery.`,
      );

      const partialText = this.extractOutputText(response);
      if (partialText && partialText.trim().length > 0) {
        try {
          const partialCandidate = this.extractJsonCandidate(partialText);
          // In non-strict mode, skip schema parse — let the caller's standard schema handle it
          const parsed = input.strict === false
            ? partialCandidate as T
            : input.schema.parse(partialCandidate);
          this.logger.warn(
            `[OpenAIDirect] Recovered valid output from incomplete response ${responseId} (reason: ${reason})`,
          );
          return {
            output: parsed,
            rawText: partialText,
            usage: response.usage
              ? {
                  inputTokens: response.usage.input_tokens ?? 0,
                  outputTokens: response.usage.output_tokens ?? 0,
                }
              : undefined,
            finishReason: "incomplete",
            telemetry: buildOpenAiTelemetry({
              model: input.modelName,
              startedAt,
              completedAt,
              response,
              finishReason: "incomplete",
              request: {
                temperature: input.temperature,
                maxOutputTokens: input.maxOutputTokens,
                reasoningEffort: input.reasoningEffort,
                strict: input.strict,
                schemaName: input.schemaName,
              },
            }),
          };
        } catch {
          this.logger.warn(
            `[OpenAIDirect] Partial output from ${responseId} failed to parse, throwing.`,
          );
        }
      }

      throw new Error(
        `OpenAI response ${responseId} incomplete (reason: ${reason}). The model hit its output token limit. Try reducing prompt size or simplifying the schema.`,
      );
    }

    if (status !== "completed") {
      throw new Error(
        `OpenAI response ${responseId} ended with status ${status}`,
      );
    }

    const rawText = this.extractOutputText(response);
    const usage = response.usage;

    this.logger.debug(
      `[OpenAIDirect] model=${input.modelName} status=${status} rawTextLength=${rawText.length} usage=${usage ? `in:${usage.input_tokens},out:${usage.output_tokens}` : "unknown"} responseId=${responseId}`,
    );

    if (usage) {
      const outputTokens = usage.output_tokens ?? 0;
      if (input.maxOutputTokens && outputTokens >= input.maxOutputTokens * 0.95) {
        this.logger.warn(
          `[OpenAIDirect] Response ${responseId} used ${outputTokens}/${input.maxOutputTokens} output tokens (near limit). Output may be truncated.`,
        );
      }
    }

    if (!rawText || rawText.trim().length === 0) {
      throw new Error(
        `OpenAI returned empty content (status: ${status}, responseId: ${responseId}). Try increasing maxOutputTokens.`,
      );
    }

    const candidate = this.extractJsonCandidate(rawText);

    // In non-strict mode, skip the OpenAI schema parse — the caller's standard
    // schema (with preprocessing/defaults) handles validation and gap-filling.
    if (input.strict === false) {
      return {
        output: candidate as T,
        rawText,
        usage: usage
          ? {
              inputTokens: usage.input_tokens ?? 0,
              outputTokens: usage.output_tokens ?? 0,
            }
          : undefined,
        finishReason: status,
        telemetry: buildOpenAiTelemetry({
          model: input.modelName,
          startedAt,
          completedAt,
          response,
          finishReason: status,
          request: {
            temperature: input.temperature,
            maxOutputTokens: input.maxOutputTokens,
            reasoningEffort: input.reasoningEffort,
            strict: input.strict,
            schemaName: input.schemaName,
          },
        }),
      };
    }

    let parsed: T;
    try {
      parsed = input.schema.parse(candidate);
    } catch (error) {
      const errMessage =
        error instanceof Error ? error.message : String(error);
      const preview = rawText.slice(0, 500);
      throw new Error(
        `OpenAI structured output parse failed: ${errMessage} | responseId=${responseId} | rawTextPreview=${preview}`,
      );
    }

    return {
      output: parsed,
      rawText,
      usage: usage
        ? {
            inputTokens: usage.input_tokens ?? 0,
            outputTokens: usage.output_tokens ?? 0,
          }
        : undefined,
      finishReason: status,
      telemetry: buildOpenAiTelemetry({
        model: input.modelName,
        startedAt,
        completedAt,
        response,
        finishReason: status,
        request: {
          temperature: input.temperature,
          maxOutputTokens: input.maxOutputTokens,
          reasoningEffort: input.reasoningEffort,
          strict: input.strict,
          schemaName: input.schemaName,
        },
      }),
    };
  }

  async clearPersistedResponse(jobKey?: string): Promise<void> {
    if (!jobKey?.trim()) {
      return;
    }
    await this.redis.del(`${REDIS_KEY_PREFIX}${jobKey}`);
  }

  async generateStructured<T>(
    input: OpenAiDirectCallInput<T>,
  ): Promise<OpenAiDirectCallResult<T>> {
    if (!this.client) {
      throw new Error(
        "OpenAI direct client not configured (missing OPENAI_API_KEY)",
      );
    }

    const startedAt = new Date();
    const redisKey = input.jobKey
      ? `${REDIS_KEY_PREFIX}${input.jobKey}`
      : undefined;

    let responseId: string;
    try {
      const submission = await this.submitStructured(input);
      responseId = submission.responseId;
    } catch (error) {
      if (redisKey) {
        await this.redis.del(redisKey);
      }
      throw error;
    }

    let response: OpenAI.Responses.Response;
    try {
      response = await this.awaitTerminal(responseId, input.abortSignal);
    } catch (error) {
      if (redisKey) {
        await this.redis.del(redisKey);
      }
      throw error;
    }

    if (redisKey) {
      await this.redis.del(redisKey);
    }

    return this.parseStructuredResponse(
      input,
      response,
      responseId,
      startedAt,
      new Date(),
    );
  }

  private buildCreateRequest<T>(input: OpenAiDirectCallInput<T>) {
    const supportsTemperature = !input.modelName
      .trim()
      .toLowerCase()
      .startsWith("gpt-5");

    return {
      model: input.modelName,
      background: true,
      input: [
        { role: "system" as const, content: input.system },
        { role: "user" as const, content: input.prompt },
      ],
      text: {
        format: this.buildTextFormat(input),
      },
      ...(supportsTemperature && input.temperature !== undefined
        ? { temperature: input.temperature }
        : {}),
      ...(input.maxOutputTokens !== undefined
        ? { max_output_tokens: input.maxOutputTokens }
        : {}),
      ...(input.reasoningEffort
        ? { reasoning: { effort: input.reasoningEffort } }
        : {}),
    };
  }

  private buildTextFormat<T>(input: OpenAiDirectCallInput<T>) {
    const format = zodTextFormat(input.schema, input.schemaName);
    if (input.strict === false) {
      // Override strict mode so the model can omit fields it has no data for.
      // The caller's standard schema (with z.preprocess / .default()) handles normalization.
      const jsonSchema = format as unknown as Record<string, unknown>;
      if (jsonSchema.json_schema && typeof jsonSchema.json_schema === "object") {
        (jsonSchema.json_schema as Record<string, unknown>).strict = false;
      }
    }
    return format;
  }

  // ── Polling helpers ───────────────────────────────────────────────

  private async awaitTerminal(
    responseId: string,
    abortSignal?: AbortSignal,
  ): Promise<OpenAI.Responses.Response> {
     
    while (true) {
      this.throwIfAborted(abortSignal);
      const response = await this.client!.responses.retrieve(responseId);
      if (response.status && TERMINAL_STATUSES.has(response.status)) {
        return response;
      }
      await this.sleep(POLL_INTERVAL_MS, abortSignal);
    }
  }

  private extractOutputText(response: OpenAI.Responses.Response): string {
    if (
      typeof response.output_text === "string" &&
      response.output_text.length > 0
    ) {
      return response.output_text;
    }

    const textParts: string[] = [];
    for (const item of response.output) {
      if (item.type === "message") {
        for (const content of item.content) {
          if (
            content.type === "output_text" &&
            typeof content.text === "string"
          ) {
            textParts.push(content.text);
          }
        }
      }
    }
    return textParts.join("\n");
  }

  private extractJsonCandidate(text: string): unknown {
    const trimmed = text.trim();
    if (!trimmed) {
      return null;
    }

    const direct = this.tryParseJsonObject(trimmed);
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

    const candidates = this.extractBalancedJsonObjects(text);
    for (const candidate of candidates) {
      const parsed = this.tryParseJsonObject(candidate);
      if (parsed) {
        return parsed;
      }
    }

    return null;
  }

  private tryParseJsonObject(text: string): unknown {
    if (!text) {
      return null;
    }

    try {
      const parsed = JSON.parse(text);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
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
      if (char === '"') {
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

  private throwIfAborted(signal?: AbortSignal): void {
    if (signal?.aborted) {
      throw new Error("Operation aborted");
    }
  }

  private async sleep(ms: number, abortSignal?: AbortSignal): Promise<void> {
    if (ms <= 0) return;
    if (!abortSignal) {
      await new Promise<void>((resolve) => setTimeout(resolve, ms));
      return;
    }
    this.throwIfAborted(abortSignal);
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        abortSignal.removeEventListener("abort", onAbort);
        resolve();
      }, ms);
      const onAbort = () => {
        clearTimeout(timer);
        reject(new Error("Operation aborted"));
      };
      abortSignal.addEventListener("abort", onAbort, { once: true });
    });
  }
}
