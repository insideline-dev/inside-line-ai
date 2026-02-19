import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { and, eq, lt } from "drizzle-orm";
import { DrizzleService } from "../../../database";
import type { EvaluationFallbackReason } from "../interfaces/agent.interface";
import { PipelinePhase } from "../interfaces/pipeline.interface";
import { pipelineAgentRun } from "../entities";

type AgentRunStatus = "running" | "completed" | "failed" | "fallback";
type TraceKind = "ai_agent" | "phase_step";

export interface RecordPipelineAgentRunInput {
  startupId: string;
  pipelineRunId: string;
  phase: PipelinePhase;
  agentKey: string;
  traceKind?: TraceKind;
  stepKey?: string;
  status: AgentRunStatus;
  attempt?: number;
  retryCount?: number;
  usedFallback?: boolean;
  inputPrompt?: string;
  inputText?: string;
  inputJson?: unknown;
  outputText?: string;
  outputJson?: unknown;
  meta?: Record<string, unknown>;
  error?: string;
  fallbackReason?: EvaluationFallbackReason;
  rawProviderError?: string;
  startedAt?: Date;
  completedAt?: Date;
}

@Injectable()
export class PipelineAgentTraceService {
  private readonly logger = new Logger(PipelineAgentTraceService.name);
  private readonly promptCharLimit: number;
  private readonly outputCharLimit: number;
  private readonly jsonByteLimit: number;
  private readonly metaByteLimit: number;
  private readonly retentionDays: number;
  private lastCleanupAt = 0;

  constructor(
    private drizzle: DrizzleService,
    private config: ConfigService,
  ) {
    this.promptCharLimit = this.config.get<number>(
      "AI_AGENT_TRACE_MAX_PROMPT_CHARS",
      30_000,
    );
    this.outputCharLimit = this.config.get<number>(
      "AI_AGENT_TRACE_MAX_OUTPUT_CHARS",
      50_000,
    );
    this.jsonByteLimit = this.config.get<number>(
      "AI_AGENT_TRACE_MAX_JSON_BYTES",
      250_000,
    );
    this.metaByteLimit = this.config.get<number>(
      "AI_AGENT_TRACE_MAX_META_BYTES",
      50_000,
    );
    this.retentionDays = this.config.get<number>(
      "AI_AGENT_TRACE_RETENTION_DAYS",
      30,
    );
  }

  async recordRun(input: RecordPipelineAgentRunInput): Promise<void> {
    const traceKind = input.traceKind ?? "ai_agent";
    const attempt = this.normalizeNonNegativeInt(input.attempt, 1);
    const retryCount = this.normalizeNonNegativeInt(
      input.retryCount,
      Math.max(0, attempt - 1),
    );
    const inputPrompt = this.truncateText(
      input.inputPrompt ?? input.inputText,
      this.promptCharLimit,
    );
    const outputText = this.truncateText(input.outputText, this.outputCharLimit);
    const inputJson = this.normalizeJsonField(input.inputJson, this.jsonByteLimit);
    const outputJson = this.attachTraceMeta(
      this.normalizeJsonField(input.outputJson, this.jsonByteLimit),
      traceKind,
      input.fallbackReason,
      input.rawProviderError,
    );
    const meta = this.normalizeMeta(input.meta);

    await this.drizzle.db.insert(pipelineAgentRun).values({
      startupId: input.startupId,
      pipelineRunId: input.pipelineRunId,
      phase: input.phase,
      agentKey: input.agentKey,
      traceKind,
      stepKey: input.stepKey,
      status: input.status,
      attempt,
      retryCount,
      usedFallback:
        input.usedFallback ??
        (traceKind === "ai_agent" && input.status === "fallback"),
      inputPrompt,
      inputJson,
      outputText,
      outputJson,
      meta,
      error: input.error,
      startedAt: input.startedAt ?? new Date(),
      completedAt: input.completedAt ?? new Date(),
    });
  }

  async cleanupExpired(force = false): Promise<void> {
    if (this.retentionDays <= 0) {
      return;
    }

    const now = Date.now();
    const CLEANUP_WINDOW_MS = 60 * 60 * 1000;
    if (!force && now - this.lastCleanupAt < CLEANUP_WINDOW_MS) {
      return;
    }

    this.lastCleanupAt = now;
    const cutoff = new Date(now - this.retentionDays * 24 * 60 * 60 * 1000);

    try {
      await this.drizzle.db
        .delete(pipelineAgentRun)
        .where(lt(pipelineAgentRun.createdAt, cutoff));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Agent trace cleanup failed: ${message}`);
    }
  }

  async clearPipelineRuns(startupId: string, pipelineRunId: string): Promise<void> {
    await this.drizzle.db
      .delete(pipelineAgentRun)
      .where(
        and(
          eq(pipelineAgentRun.startupId, startupId),
          eq(pipelineAgentRun.pipelineRunId, pipelineRunId),
        ),
      );
  }

  private truncateText(value: string | undefined, limit: number): string | null {
    if (!value) {
      return null;
    }

    if (value.length <= limit) {
      return value;
    }

    return `${value.slice(0, limit)}\n\n[TRUNCATED]`;
  }

  private normalizeJsonField(value: unknown, limitBytes: number): unknown | null {
    if (value === undefined) {
      return null;
    }

    try {
      const parsed = JSON.parse(JSON.stringify(value)) as unknown;
      return this.limitJsonPayload(parsed, limitBytes);
    } catch {
      return null;
    }
  }

  private normalizeMeta(value: Record<string, unknown> | undefined): Record<string, unknown> | null {
    if (!value) {
      return null;
    }
    const normalized = this.normalizeJsonField(value, this.metaByteLimit);
    if (!normalized || typeof normalized !== "object" || Array.isArray(normalized)) {
      return null;
    }
    return normalized as Record<string, unknown>;
  }

  private limitJsonPayload(value: unknown, limitBytes: number): unknown {
    try {
      const serialized = JSON.stringify(value);
      const serializedBytes = Buffer.byteLength(serialized, "utf8");
      if (serializedBytes <= limitBytes) {
        return value;
      }

      const preview = serialized.slice(0, Math.max(0, limitBytes));
      return {
        __truncated: true,
        __originalBytes: serializedBytes,
        __keptBytes: limitBytes,
        __preview: `${preview}\n\n[TRUNCATED]`,
      };
    } catch {
      return {
        __truncated: true,
        __originalBytes: 0,
        __keptBytes: limitBytes,
        __preview: "[UNSERIALIZABLE JSON PAYLOAD]",
      };
    }
  }

  private attachTraceMeta(
    outputJson: unknown | null,
    traceKind: TraceKind,
    fallbackReason: EvaluationFallbackReason | undefined,
    rawProviderError: string | undefined,
  ): unknown | null {
    if (traceKind !== "ai_agent") {
      return outputJson;
    }

    const traceMeta = {
      ...(fallbackReason ? { fallbackReason } : {}),
      ...(rawProviderError ? { rawProviderError } : {}),
    };
    const hasTraceMeta = Object.keys(traceMeta).length > 0;

    if (!hasTraceMeta) {
      return outputJson;
    }
    if (!outputJson) {
      return {
        __traceMeta: traceMeta,
      };
    }
    if (Array.isArray(outputJson)) {
      return {
        __traceMeta: traceMeta,
        __traceOutput: outputJson,
      };
    }
    if (typeof outputJson !== "object") {
      return {
        __traceMeta: traceMeta,
        __traceOutput: outputJson,
      };
    }
    return {
      ...(outputJson as Record<string, unknown>),
      __traceMeta: traceMeta,
    };
  }

  private normalizeNonNegativeInt(value: number | undefined, fallback: number): number {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return fallback;
    }
    return Math.max(0, Math.floor(value));
  }
}
