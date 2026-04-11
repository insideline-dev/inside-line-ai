import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import { z } from "zod";

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
}

export interface OpenAiDirectCallResult<T> {
  output: T;
  rawText: string;
  usage?: { inputTokens: number; outputTokens: number };
  finishReason?: string;
}

/**
 * Calls OpenAI chat completions directly (bypassing the Vercel AI SDK) for
 * structured output generation. Used by synthesis agents when the selected
 * model is an OpenAI model, to avoid AI-SDK schema translation issues with
 * strict JSON schema mode (e.g. `z.preprocess()` rejection).
 */
@Injectable()
export class OpenAiDirectClientService {
  private readonly logger = new Logger(OpenAiDirectClientService.name);
  private readonly client: OpenAI | null;

  constructor(private readonly config: ConfigService) {
    const apiKey = this.config.get<string>("OPENAI_API_KEY");
    this.client = apiKey ? new OpenAI({ apiKey }) : null;
    if (!this.client) {
      this.logger.warn(
        "OpenAI direct client not configured — OPENAI_API_KEY missing. Synthesis agents will fall back to AI SDK.",
      );
    }
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

    const response = await this.client.chat.completions.create(
      {
        model: input.modelName,
        messages: [
          { role: "system", content: input.system },
          { role: "user", content: input.prompt },
        ],
        response_format: zodResponseFormat(input.schema, input.schemaName),
        ...(supportsTemperature && input.temperature !== undefined
          ? { temperature: input.temperature }
          : {}),
        ...(input.maxOutputTokens !== undefined
          ? { max_completion_tokens: input.maxOutputTokens }
          : {}),
        ...(input.reasoningEffort
          ? { reasoning_effort: input.reasoningEffort }
          : {}),
      },
      { signal: input.abortSignal },
    );

    const choice = response.choices[0];
    const finishReason = choice?.finish_reason;
    const message = choice?.message;
    const rawText = message?.content ?? "";
    const refusal = (message as { refusal?: string | null } | undefined)?.refusal ?? null;

    this.logger.debug(
      `[OpenAIDirect] model=${input.modelName} finishReason=${finishReason ?? "unknown"} rawTextLength=${rawText.length} refusal=${refusal ? "yes" : "no"} usage=${response.usage ? `in:${response.usage.prompt_tokens},out:${response.usage.completion_tokens}` : "unknown"}`,
    );

    if (refusal) {
      throw new Error(`OpenAI refused to respond: ${refusal}`);
    }

    if (!rawText || rawText.trim().length === 0) {
      throw new Error(
        `OpenAI returned empty content (finish_reason: ${finishReason ?? "unknown"}). This often indicates the model hit the token limit or a refusal. Try increasing maxOutputTokens.`,
      );
    }

    if (finishReason === "length") {
      this.logger.warn(
        `[OpenAIDirect] Response truncated (finish_reason=length) for ${input.schemaName}. Output may be incomplete.`,
      );
    }

    let parsed: T;
    try {
      const json = JSON.parse(rawText) as unknown;
      parsed = input.schema.parse(json);
    } catch (error) {
      const errMessage = error instanceof Error ? error.message : String(error);
      const preview = rawText.slice(0, 500);
      throw new Error(
        `OpenAI structured output parse failed: ${errMessage} | finishReason=${finishReason ?? "unknown"} | rawTextPreview=${preview}`,
      );
    }

    return {
      output: parsed,
      rawText,
      usage: response.usage
        ? {
            inputTokens: response.usage.prompt_tokens ?? 0,
            outputTokens: response.usage.completion_tokens ?? 0,
          }
        : undefined,
      finishReason: finishReason ?? undefined,
    };
  }
}
