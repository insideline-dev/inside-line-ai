import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import OpenAI from "openai";
import type { OpenAiResponseTelemetry } from "../interfaces/agent.interface";
import type { SourceEntry } from "../interfaces/phase-results.interface";

const DEFAULT_DEEP_RESEARCH_TIMEOUT_MS = 3_600_000;

interface OpenAiDeepResearchTextRequest {
  agent: SourceEntry["agent"];
  modelName: string;
  systemPrompt: string;
  prompt: string;
  enableWebSearch: boolean;
  timeoutMs?: number;
  resumeResponseId?: string;
  abortSignal?: AbortSignal;
  onCheckpoint?: (event: OpenAiDeepResearchCheckpointEvent) => Promise<void> | void;
}

interface OpenAiDeepResearchTextResponse {
  text: string;
  sources: SourceEntry[];
  rawMeta: Record<string, unknown>;
  telemetry?: OpenAiResponseTelemetry;
}

export interface OpenAiDeepResearchCheckpointEvent {
  responseId: string;
  status?: string;
  modelName?: string;
  resumed: boolean;
  timeoutMs: number;
  pollIntervalMs: number;
  checkpointEvent: "created" | "resumed" | "terminal";
}

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
      outputItemCount: Array.isArray(response.output) ? response.output.length : undefined,
    },
    error,
  };
}

@Injectable()
export class OpenAiDeepResearchService {
  private readonly logger = new Logger(OpenAiDeepResearchService.name);
  private client: OpenAI | null = null;
  private static readonly TERMINAL_STATUSES = new Set([
    "completed",
    "failed",
    "cancelled",
    "incomplete",
    "expired",
  ]);

  constructor(private config: ConfigService) {}

  isConfigured(): boolean {
    return Boolean(this.config.get<string>("OPENAI_API_KEY"));
  }

  async createResponse(params: {
    model: string;
    instructions: string;
    input: string;
    tools?: OpenAI.Responses.Tool[];
    include?: OpenAI.Responses.ResponseIncludable[];
    temperature?: number;
    previousResponseId?: string;
  }): Promise<OpenAI.Responses.Response> {
    if (!this.isConfigured()) {
      throw new ServiceUnavailableException(
        "OPENAI_API_KEY is not configured",
      );
    }

    const client = this.getClient();
    return client.responses.create({
      model: params.model,
      instructions: params.instructions,
      input: params.input,
      tools: params.tools,
      include: params.include,
      temperature: params.temperature,
      ...(params.previousResponseId
        ? { previous_response_id: params.previousResponseId }
        : {}),
    });
  }

  async runResearchText(
    request: OpenAiDeepResearchTextRequest,
  ): Promise<OpenAiDeepResearchTextResponse> {
    if (!this.isConfigured()) {
      throw new ServiceUnavailableException(
        "OPENAI_API_KEY is not configured",
      );
    }

    const client = this.getClient();
    const timeoutMs = this.resolveTimeoutMs(request.timeoutMs);
    const pollIntervalMs = this.getPollIntervalMs();
    const startedAt = new Date();
    const resumeResponseId = request.resumeResponseId?.trim();
    const resumed = typeof resumeResponseId === "string" && resumeResponseId.length > 0;
    const createdResponse = resumed
      ? null
      : await client.responses.create({
          model: request.modelName,
          background: true,
          input: [
            {
              role: "system",
              content: request.systemPrompt,
            },
            {
              role: "user",
              content: request.prompt,
            },
          ],
          tools: request.enableWebSearch
            ? [{ type: "web_search_preview" }]
            : undefined,
        });
    const initialResponse = resumed
      ? await client.responses.retrieve(resumeResponseId)
      : createdResponse;
    const responseId =
      this.readString(initialResponse, "id") ??
      (createdResponse ? this.readString(createdResponse, "id") : undefined);
    if (!responseId) {
      throw new Error("OpenAI deep research response is missing id");
    }

    await this.emitCheckpoint(request.onCheckpoint, {
      responseId,
      status: this.readStatus(initialResponse),
      modelName:
        this.readString(initialResponse, "model") ??
        (createdResponse ? this.readString(createdResponse, "model") : undefined),
      resumed,
      timeoutMs,
      pollIntervalMs,
      checkpointEvent: resumed ? "resumed" : "created",
    });

    const response = await this.awaitTerminalResponse(
      client,
      initialResponse,
      timeoutMs,
      pollIntervalMs,
      request.abortSignal,
    );
    const completedAt = new Date();
    const status = this.readStatus(response);

    await this.emitCheckpoint(request.onCheckpoint, {
      responseId,
      status,
      modelName:
        this.readString(response, "model") ??
        (createdResponse ? this.readString(createdResponse, "model") : undefined),
      resumed,
      timeoutMs,
      pollIntervalMs,
      checkpointEvent: "terminal",
    });

    if (status !== "completed") {
      throw new Error(
        `OpenAI deep research response ${responseId ?? "unknown"} ended with status ${status ?? "unknown"}`,
      );
    }

    const text = this.extractOutputText(response).trim();
    const urls = this.extractUrls(response);
    const sources = this.toSourceEntries(urls, request.agent);

    return {
      text,
      sources,
      rawMeta: {
        responseId,
        status,
        initialStatus: this.readStatus(initialResponse),
        resumed,
        timeoutMs,
        pollIntervalMs,
        model:
          this.readString(response, "model") ??
          (createdResponse ? this.readString(createdResponse, "model") : undefined),
      },
      telemetry: buildOpenAiTelemetry({
        model: request.modelName,
        startedAt,
        completedAt,
        response: response as OpenAI.Responses.Response,
        finishReason: status ?? undefined,
        request: {
          enableWebSearch: request.enableWebSearch,
          resumed,
        },
      }),
    };
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
      timeout: 3600 * 1000,
    });
    return this.client;
  }

  private extractOutputText(response: unknown): string {
    const responseRecord = this.asRecord(response);
    const directText = this.readString(responseRecord, "output_text");
    if (directText) {
      return directText;
    }

    const output = responseRecord.output;
    if (!Array.isArray(output)) {
      return "";
    }

    const textParts: string[] = [];
    for (const item of output) {
      const itemRecord = this.asRecord(item);
      if (itemRecord.type !== "message") {
        continue;
      }
      const content = itemRecord.content;
      if (!Array.isArray(content)) {
        continue;
      }
      for (const part of content) {
        const partRecord = this.asRecord(part);
        const partText = this.readString(partRecord, "text");
        if (partRecord.type === "output_text" && partText) {
          textParts.push(partText);
        }
      }
    }

    const joined = textParts.join("\n").trim();
    if (joined.length === 0) {
      this.logger.warn("OpenAI deep research response did not contain output text");
    }
    return joined;
  }

  private async awaitTerminalResponse(
    client: OpenAI,
    initialResponse: unknown,
    timeoutMs: number,
    pollIntervalMs: number,
    abortSignal?: AbortSignal,
  ): Promise<unknown> {
    this.throwIfAborted(abortSignal);
    const initialStatus = this.readStatus(initialResponse);
    if (this.isTerminalStatus(initialStatus)) {
      return initialResponse;
    }

    const responseId = this.readString(initialResponse, "id");
    if (!responseId) {
      throw new Error("OpenAI deep research response is missing id");
    }

    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      this.throwIfAborted(abortSignal);
      const response = await client.responses.retrieve(responseId);
      const status = this.readStatus(response);
      if (this.isTerminalStatus(status)) {
        return response;
      }

      const remainingMs = deadline - Date.now();
      if (remainingMs <= 0) {
        break;
      }
      await this.sleep(Math.min(pollIntervalMs, remainingMs), abortSignal);
    }

    throw new Error(
      `OpenAI deep research timed out after ${timeoutMs}ms (responseId: ${responseId})`,
    );
  }

  private extractUrls(response: unknown): string[] {
    const urls = new Set<string>();
    this.collectUrls(response, urls);
    return Array.from(urls);
  }

  private collectUrls(value: unknown, urls: Set<string>): void {
    if (typeof value === "string") {
      const normalized = this.normalizeUrl(value);
      if (normalized) {
        urls.add(normalized);
      }
      return;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        this.collectUrls(item, urls);
      }
      return;
    }

    if (!value || typeof value !== "object") {
      return;
    }

    for (const nested of Object.values(value)) {
      this.collectUrls(nested, urls);
    }
  }

  private toSourceEntries(
    urls: string[],
    agent: SourceEntry["agent"],
  ): SourceEntry[] {
    const timestamp = new Date().toISOString();
    return urls.map((url) => ({
      name: this.toSourceName(url),
      url,
      type: "search",
      agent,
      timestamp,
    }));
  }

  private normalizeUrl(url: string): string | null {
    const trimmed = url.trim();
    if (!/^https?:\/\//i.test(trimmed)) {
      return null;
    }

    try {
      const parsed = new URL(trimmed);
      return parsed.toString();
    } catch {
      return null;
    }
  }

  private toSourceName(url: string): string {
    try {
      const parsed = new URL(url);
      return parsed.hostname.replace(/^www\./, "") || "web source";
    } catch {
      return "web source";
    }
  }

  private readStatus(response: unknown): string | undefined {
    const status = this.readString(response, "status");
    if (!status) {
      return undefined;
    }
    return status.toLowerCase();
  }

  private isTerminalStatus(status: string | undefined): boolean {
    if (!status) {
      return false;
    }
    return OpenAiDeepResearchService.TERMINAL_STATUSES.has(status);
  }

  private resolveTimeoutMs(requestTimeoutMs: number | undefined): number {
    if (
      typeof requestTimeoutMs === "number" &&
      Number.isFinite(requestTimeoutMs) &&
      requestTimeoutMs > 0
    ) {
      return Math.floor(requestTimeoutMs);
    }

    const configured = this.config.get<number>("AI_RESEARCH_ATTEMPT_TIMEOUT_MS");
    if (
      typeof configured === "number" &&
      Number.isFinite(configured) &&
      configured > 0
    ) {
      return Math.floor(configured);
    }

    return DEFAULT_DEEP_RESEARCH_TIMEOUT_MS;
  }

  private getPollIntervalMs(): number {
    const configured = this.config.get<number>(
      "OPENAI_DEEP_RESEARCH_POLL_INTERVAL_MS",
    );
    if (
      typeof configured === "number" &&
      Number.isFinite(configured) &&
      configured > 0
    ) {
      return Math.floor(configured);
    }
    return 15_000;
  }

  private async sleep(ms: number, abortSignal?: AbortSignal): Promise<void> {
    if (ms <= 0) {
      return;
    }
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
        abortSignal.removeEventListener("abort", onAbort);
        reject(this.toAbortError(abortSignal));
      };
      abortSignal.addEventListener("abort", onAbort, { once: true });
    });
  }

  private throwIfAborted(abortSignal: AbortSignal | undefined): void {
    if (!abortSignal?.aborted) {
      return;
    }
    throw this.toAbortError(abortSignal);
  }

  private toAbortError(abortSignal: AbortSignal): Error {
    const reason = abortSignal.reason;
    if (reason instanceof Error) {
      return reason;
    }
    if (typeof reason === "string" && reason.trim().length > 0) {
      return new Error(reason);
    }
    return new Error("OpenAI deep research request was aborted");
  }

  private async emitCheckpoint(
    callback:
      | ((event: OpenAiDeepResearchCheckpointEvent) => Promise<void> | void)
      | undefined,
    event: OpenAiDeepResearchCheckpointEvent,
  ): Promise<void> {
    if (!callback) {
      return;
    }
    await callback(event);
  }

  private asRecord(value: unknown): Record<string, unknown> {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
    return {};
  }

  private readString(value: unknown, key: string): string | undefined {
    const record = this.asRecord(value);
    const raw = record[key];
    return typeof raw === "string" ? raw : undefined;
  }
}
