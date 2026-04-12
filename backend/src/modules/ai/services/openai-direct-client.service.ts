import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
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
  /** Unique key for response ID persistence (e.g. `startupId:agentKey`). Enables crash recovery. */
  jobKey?: string;
}

export interface OpenAiDirectCallResult<T> {
  output: T;
  rawText: string;
  usage?: { inputTokens: number; outputTokens: number };
  finishReason?: string;
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

  async generateStructured<T>(
    input: OpenAiDirectCallInput<T>,
  ): Promise<OpenAiDirectCallResult<T>> {
    if (!this.client) {
      throw new Error(
        "OpenAI direct client not configured (missing OPENAI_API_KEY)",
      );
    }

    const supportsTemperature = !input.modelName
      .trim()
      .toLowerCase()
      .startsWith("gpt-5");

    const redisKey = input.jobKey
      ? `${REDIS_KEY_PREFIX}${input.jobKey}`
      : undefined;

    // ── 1. Resume or create ────────────────────────────────────────
    let responseId: string;
    const existingId = redisKey ? await this.redis.get(redisKey) : null;

    if (existingId) {
      responseId = existingId;
      this.logger.log(
        `[OpenAIDirect] Resuming existing response ${responseId} for key=${input.jobKey}`,
      );
    } else {
      const created = await this.client.responses.create({
        model: input.modelName,
        background: true,
        input: [
          { role: "system", content: input.system },
          { role: "user", content: input.prompt },
        ],
        text: {
          format: zodTextFormat(input.schema, input.schemaName),
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
      });

      responseId = created.id;
      if (redisKey) {
        await this.redis.set(redisKey, responseId, RESPONSE_ID_TTL_SECONDS);
      }
      this.logger.debug(
        `[OpenAIDirect] Created background response ${responseId} model=${input.modelName} key=${input.jobKey ?? "none"}`,
      );
    }

    // ── 2. Poll until terminal ─────────────────────────────────────
    const response = await this.awaitTerminal(responseId, input.abortSignal);

    // Clean up persisted ID once we have a terminal result
    if (redisKey) {
      await this.redis.del(redisKey);
    }

    const status = response.status;
    if (status !== "completed") {
      throw new Error(
        `OpenAI response ${responseId} ended with status ${status}`,
      );
    }

    // ── 3. Extract and parse output ────────────────────────────────
    const rawText = this.extractOutputText(response);
    const usage = response.usage;

    this.logger.debug(
      `[OpenAIDirect] model=${input.modelName} status=${status} rawTextLength=${rawText.length} usage=${usage ? `in:${usage.input_tokens},out:${usage.output_tokens}` : "unknown"} responseId=${responseId}`,
    );

    if (!rawText || rawText.trim().length === 0) {
      throw new Error(
        `OpenAI returned empty content (status: ${status}, responseId: ${responseId}). Try increasing maxOutputTokens.`,
      );
    }

    let parsed: T;
    try {
      const json = JSON.parse(rawText) as unknown;
      parsed = input.schema.parse(json);
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
    };
  }

  // ── Polling helpers ───────────────────────────────────────────────

  private async awaitTerminal(
    responseId: string,
    abortSignal?: AbortSignal,
  ): Promise<OpenAI.Responses.Response> {
    // eslint-disable-next-line no-constant-condition
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
    for (const item of response.output) {
      if (item.type === "message") {
        for (const content of item.content) {
          if (content.type === "output_text") {
            return content.text;
          }
        }
      }
    }
    return "";
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
