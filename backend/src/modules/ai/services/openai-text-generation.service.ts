import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { ToolChoice, ToolSet } from "ai";
import { type ModelMessage } from "ai";
import OpenAI from "openai";
import { zodResponsesFunction, zodTextFormat } from "openai/helpers/zod";
import type { ZodTypeAny } from "zod";
import type { OpenAiResponseTelemetry } from "../interfaces/agent.interface";

const DEFAULT_MAX_TOOL_ROUNDTRIPS = 6;

type GenerateTextToolChoice = ToolChoice<ToolSet>;

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

export interface OpenAiTextGenerationResult<TOutput = unknown> {
  text: string;
  output: TOutput | undefined;
  experimental_output: TOutput | undefined;
  sources: Array<{ title?: string; url?: string }>;
  responseId?: string;
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

export interface OpenAiTextGenerationParams {
  modelName: string;
  system?: string;
  prompt: string;
  schema?: ZodTypeAny;
  temperature?: number;
  maxOutputTokens?: number;
  reasoningEffort?: "low" | "medium" | "high";
  tools?: ToolSet;
  toolChoice?: GenerateTextToolChoice;
  maxToolRoundtrips?: number;
  abortSignal?: AbortSignal;
}

@Injectable()
export class OpenAiTextGenerationService {
  private client: OpenAI | null = null;

  constructor(private config: ConfigService) {}

  async generate<TOutput = unknown>(
    params: OpenAiTextGenerationParams,
  ): Promise<OpenAiTextGenerationResult<TOutput>> {
    if (!this.isConfigured()) {
      throw new ServiceUnavailableException("OPENAI_API_KEY is not configured");
    }

    const client = this.getClient();
    const tools = params.tools ? this.convertTools(params.tools) : [];
    const toolChoice = this.convertToolChoice(params.toolChoice);
    const maxToolRoundtrips = Math.max(
      1,
      params.maxToolRoundtrips ?? DEFAULT_MAX_TOOL_ROUNDTRIPS,
    );
    const temperature = this.supportsTemperature(params.modelName)
      ? params.temperature
      : undefined;
    const shouldUseParse = Boolean(params.schema) && tools.length === 0;

    if (shouldUseParse && params.schema) {
      const startedAt = new Date();
      const response = await client.responses.parse(
        {
          model: params.modelName,
          input: this.buildInput(params.system, params.prompt),
          text: {
            format: zodTextFormat(params.schema, "response"),
          },
          temperature,
          max_output_tokens: params.maxOutputTokens,
          reasoning: this.toReasoningConfig(params.reasoningEffort),
        },
        {
          signal: params.abortSignal,
        },
      );
      const completedAt = new Date();

      return {
        text: this.extractOutputText(response).trim(),
        output: (response.output_parsed as TOutput | null) ?? undefined,
        experimental_output:
          (response.output_parsed as TOutput | null) ?? undefined,
        sources: this.extractSources(response),
        responseId: response.id,
        finishReason: this.readString(response, "status"),
        telemetry: buildOpenAiTelemetry({
          model: params.modelName,
          startedAt,
          completedAt,
          response,
          finishReason: this.readString(response, "status"),
          request: {
            temperature,
            maxOutputTokens: params.maxOutputTokens,
            reasoningEffort: params.reasoningEffort,
            mode: "parse",
            toolCount: tools.length,
          },
        }),
      };
    }

    const response = await this.runCreateFlow<TOutput>({
      client,
      params,
      tools,
      toolChoice,
      maxToolRoundtrips,
    });

    const output = params.schema
      ? ((response.structured as TOutput | null) ?? undefined)
      : undefined;

    return {
      text: response.text,
      output,
      experimental_output: output,
      sources: response.sources,
      responseId: response.responseId,
      finishReason: response.finishReason,
      telemetry: response.telemetry,
    };
  }

  isConfigured(): boolean {
    return Boolean(this.config.get<string>("OPENAI_API_KEY"));
  }

  private async runCreateFlow<TOutput>(input: {
    client: OpenAI;
    params: OpenAiTextGenerationParams;
    tools: OpenAI.Responses.Tool[];
    toolChoice:
      | OpenAI.Responses.ToolChoiceOptions
      | OpenAI.Responses.ToolChoiceFunction
      | undefined;
    maxToolRoundtrips: number;
  }): Promise<{
    text: string;
    structured: TOutput | null;
    sources: Array<{ title?: string; url?: string }>;
    responseId?: string;
    finishReason?: string;
    telemetry?: OpenAiResponseTelemetry;
  }> {
    const { client, params, tools, toolChoice, maxToolRoundtrips } = input;
    const temperature = this.supportsTemperature(params.modelName)
      ? params.temperature
      : undefined;
    const startedAt = new Date();
    const textConfig: OpenAI.Responses.ResponseTextConfig | undefined =
      params.schema
        ? { format: zodTextFormat(params.schema, "response") as OpenAI.Responses.ResponseFormatTextJSONSchemaConfig }
        : undefined;

    let response = await client.responses.create(
      {
        model: params.modelName,
        input: this.buildInput(params.system, params.prompt),
        tools: tools.length > 0 ? tools : undefined,
        tool_choice: toolChoice,
        text: textConfig,
        temperature,
        max_output_tokens: params.maxOutputTokens,
        reasoning: this.toReasoningConfig(params.reasoningEffort),
      },
      {
        signal: params.abortSignal,
      },
    );

    let iteration = 0;
    while (iteration < maxToolRoundtrips) {
      const functionCalls = response.output.filter(
        (item): item is OpenAI.Responses.ResponseFunctionToolCall =>
          item.type === "function_call",
      );

      if (functionCalls.length === 0) {
        break;
      }

      const toolOutputs: OpenAI.Responses.ResponseInputItem[] = [];
      for (const call of functionCalls) {
        const tool = params.tools?.[call.name];
        if (!tool?.execute) {
          toolOutputs.push({
            type: "function_call_output",
            call_id: call.call_id,
            output: JSON.stringify({
              error: `Tool "${call.name}" is not executable`,
            }),
          });
          continue;
        }

        try {
          const args =
            (call as OpenAI.Responses.ResponseFunctionToolCall & {
              parsed_arguments?: unknown;
            }).parsed_arguments ?? JSON.parse(call.arguments);
          const result = await tool.execute(args, {
            toolCallId: call.call_id,
            messages: this.buildToolMessages(params.system, params.prompt),
            abortSignal: params.abortSignal,
          });
          toolOutputs.push({
            type: "function_call_output",
            call_id: call.call_id,
            output: JSON.stringify(result),
          });
        } catch (error) {
          toolOutputs.push({
            type: "function_call_output",
            call_id: call.call_id,
            output: JSON.stringify({
              error: this.errorMessage(error),
            }),
          });
        }
      }

      response = await client.responses.create(
        {
          model: params.modelName,
          previous_response_id: response.id,
          input: toolOutputs,
          text: textConfig,
          temperature,
          max_output_tokens: params.maxOutputTokens,
          reasoning: this.toReasoningConfig(params.reasoningEffort),
        },
        {
          signal: params.abortSignal,
        },
      );

      iteration += 1;
    }

    const text = this.extractOutputText(response).trim();
    const structured = params.schema ? this.parseStructuredText<TOutput>(text) : null;
    const completedAt = new Date();
    const finishReason = this.readString(response, "status");

    return {
      text,
      structured,
      sources: this.extractSources(response),
      responseId: response.id,
      finishReason,
      telemetry: buildOpenAiTelemetry({
        model: params.modelName,
        startedAt,
        completedAt,
        response,
        finishReason,
        request: {
          temperature,
          maxOutputTokens: params.maxOutputTokens,
          reasoningEffort: params.reasoningEffort,
          mode: "create",
          toolCount: tools.length,
          toolChoice:
            typeof toolChoice === "string"
              ? toolChoice
              : toolChoice && typeof toolChoice === "object" && "type" in toolChoice
                ? String(toolChoice.type)
                : undefined,
          maxToolRoundtrips,
        },
      }),
    };
  }

  private buildInput(
    system: string | undefined,
    prompt: string,
  ): Array<OpenAI.Responses.ResponseInputItem> {
    const input: Array<OpenAI.Responses.ResponseInputItem> = [];
    if (system && system.trim().length > 0) {
      input.push({
        role: "system",
        content: system,
      });
    }
    input.push({
      role: "user",
      content: prompt,
    });
    return input;
  }

  private buildToolMessages(
    system: string | undefined,
    prompt: string,
  ): ModelMessage[] {
    const messages: ModelMessage[] = [];
    if (system && system.trim().length > 0) {
      messages.push({ role: "system", content: system });
    }
    messages.push({ role: "user", content: prompt });
    return messages;
  }

  private supportsTemperature(modelName: string): boolean {
    const normalized = modelName.trim().toLowerCase();
    return !normalized.startsWith("gpt-5");
  }

  private convertTools(tools: ToolSet): OpenAI.Responses.Tool[] {
    return Object.entries(tools).map(([name, tool]) => {
      if (name === "web_search" || name === "google_search") {
        return {
          type: "web_search",
          search_context_size: "high",
        } satisfies OpenAI.Responses.WebSearchTool;
      }

      return zodResponsesFunction({
        name,
        description: tool.description,
        parameters: tool.inputSchema as ZodTypeAny,
      });
    });
  }

  private convertToolChoice(
    toolChoice: GenerateTextToolChoice | undefined,
  ):
    | OpenAI.Responses.ToolChoiceOptions
    | OpenAI.Responses.ToolChoiceFunction
    | undefined {
    if (!toolChoice) {
      return undefined;
    }
    if (typeof toolChoice === "string") {
      return toolChoice;
    }
    return {
      type: "function",
      name: toolChoice.toolName,
    };
  }

  private toReasoningConfig(
    reasoningEffort: OpenAiTextGenerationParams["reasoningEffort"],
  ): OpenAI.Reasoning | undefined {
    if (!reasoningEffort) {
      return undefined;
    }
    return {
      effort: reasoningEffort,
    };
  }

  private parseStructuredText<TOutput>(text: string): TOutput | null {
    const trimmed = text.trim();
    if (!trimmed) {
      return null;
    }

    try {
      return JSON.parse(trimmed) as TOutput;
    } catch {
      const match = trimmed.match(/\{[\s\S]*\}/);
      if (!match) {
        return null;
      }
      try {
        return JSON.parse(match[0]) as TOutput;
      } catch {
        return null;
      }
    }
  }

  private extractSources(
    response: OpenAI.Responses.Response,
  ): Array<{ title?: string; url?: string }> {
    const dedupe = new Map<string, { title?: string; url?: string }>();

    for (const item of response.output) {
      if (item.type !== "message") {
        continue;
      }
      for (const part of item.content) {
        if (part.type !== "output_text") {
          continue;
        }
        for (const annotation of part.annotations ?? []) {
          if (annotation.type !== "url_citation" || !annotation.url) {
            continue;
          }
          if (!dedupe.has(annotation.url)) {
            dedupe.set(annotation.url, {
              url: annotation.url,
              title: annotation.title || undefined,
            });
          }
        }
      }
    }

    return Array.from(dedupe.values());
  }

  private extractOutputText(
    response: OpenAI.Responses.Response,
  ): string {
    if (typeof response.output_text === "string" && response.output_text.length > 0) {
      return response.output_text;
    }

    const textParts: string[] = [];
    for (const item of response.output) {
      if (item.type !== "message") {
        continue;
      }
      for (const part of item.content) {
        if (part.type === "output_text" && typeof part.text === "string") {
          textParts.push(part.text);
        }
      }
    }

    return textParts.join("\n");
  }

  private getClient(): OpenAI {
    if (this.client) {
      return this.client;
    }

    const apiKey = this.config.get<string>("OPENAI_API_KEY");
    if (!apiKey) {
      throw new ServiceUnavailableException("OPENAI_API_KEY is not configured");
    }

    this.client = new OpenAI({
      apiKey,
      timeout: 3_600_000,
    });
    return this.client;
  }

  private readString(value: unknown, key: string): string | undefined {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return undefined;
    }
    const raw = (value as Record<string, unknown>)[key];
    return typeof raw === "string" ? raw : undefined;
  }

  private errorMessage(error: unknown): string {
    if (!(error instanceof Error)) {
      return String(error);
    }
    const parts: string[] = [error.message];
    let current: unknown = error.cause;
    const seen = new Set<unknown>([error]);
    while (current instanceof Error && !seen.has(current)) {
      seen.add(current);
      if (current.message && current.message !== parts[parts.length - 1]) {
        parts.push(current.message);
      }
      current = current.cause;
    }
    return parts.join(" → ");
  }
}
