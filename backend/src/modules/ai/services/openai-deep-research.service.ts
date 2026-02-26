import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import OpenAI from "openai";
import type { SourceEntry } from "../interfaces/phase-results.interface";

interface OpenAiDeepResearchTextRequest {
  agent: SourceEntry["agent"];
  modelName: string;
  systemPrompt: string;
  prompt: string;
  enableWebSearch: boolean;
  timeoutMs?: number;
}

interface OpenAiDeepResearchTextResponse {
  text: string;
  sources: SourceEntry[];
  rawMeta: Record<string, unknown>;
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

  async runResearchText(
    request: OpenAiDeepResearchTextRequest,
  ): Promise<OpenAiDeepResearchTextResponse> {
    if (!this.isConfigured()) {
      throw new ServiceUnavailableException(
        "OPENAI_API_KEY is not configured",
      );
    }

    const client = this.getClient();
    const createdResponse = await client.responses.create({
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

    const timeoutMs = this.resolveTimeoutMs(request.timeoutMs);
    const response = await this.awaitTerminalResponse(
      client,
      createdResponse,
      timeoutMs,
    );
    const status = this.readStatus(response);
    const responseId =
      this.readString(response, "id") ?? this.readString(createdResponse, "id");
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
        initialStatus: this.readStatus(createdResponse),
        model:
          this.readString(response, "model") ??
          this.readString(createdResponse, "model"),
      },
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
  ): Promise<unknown> {
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
      const response = await client.responses.retrieve(responseId);
      const status = this.readStatus(response);
      if (this.isTerminalStatus(status)) {
        return response;
      }

      const remainingMs = deadline - Date.now();
      if (remainingMs <= 0) {
        break;
      }
      await this.sleep(Math.min(this.getPollIntervalMs(), remainingMs));
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

    return 90_000;
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
    return 2_000;
  }

  private async sleep(ms: number): Promise<void> {
    await new Promise<void>((resolve) => setTimeout(resolve, ms));
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
