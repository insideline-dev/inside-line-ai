import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { and, desc, eq, lt } from "drizzle-orm";
import { DrizzleService } from "../../../database";
import type { PipelineFallbackReason } from "../interfaces/agent.interface";
import { PipelinePhase } from "../interfaces/pipeline.interface";
import { pipelineAgentRun } from "../entities";

type AgentRunStatus = "running" | "completed" | "failed" | "fallback";
type TraceKind = "ai_agent" | "phase_step";
export const OPENAI_DEEP_RESEARCH_STEP_KEY = "openai_deep_research";

interface DeepResearchMeta {
  responseId: string;
  status: string;
  modelName?: string;
  resumed?: boolean;
  pollIntervalMs?: number;
  timeoutMs?: number;
  phaseRetryCount?: number;
  agentAttemptId?: string;
  checkpointEvent?: string;
  lastPolledAt?: string;
}

export interface DeepResearchCheckpoint {
  responseId: string;
  status: string;
  modelName?: string;
  resumed: boolean;
  pollIntervalMs?: number;
  timeoutMs?: number;
  phaseRetryCount: number;
  agentAttemptId?: string;
  checkpointEvent?: string;
  startedAt?: Date;
  completedAt?: Date;
}

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
  fallbackReason?: PipelineFallbackReason;
  rawProviderError?: string;
  startedAt?: Date;
  completedAt?: Date;
}

export interface RecordDeepResearchCheckpointInput {
  startupId: string;
  pipelineRunId: string;
  phase: PipelinePhase;
  agentKey: string;
  responseId: string;
  status: string;
  modelName?: string;
  resumed?: boolean;
  pollIntervalMs?: number;
  timeoutMs?: number;
  phaseRetryCount?: number;
  agentAttemptId?: string;
  checkpointEvent?: string;
}

export interface FindDeepResearchCheckpointInput {
  startupId: string;
  pipelineRunId: string;
  phase: PipelinePhase;
  agentKey: string;
}

@Injectable()
export class PipelineAgentTraceService {
  private readonly logger = new Logger(PipelineAgentTraceService.name);
  private readonly promptCharLimit: number;
  private readonly outputCharLimit: number;
  private readonly jsonByteLimit: number;
  private readonly metaByteLimit: number;
  private readonly retentionDays: number;
  private readonly runtimeMetadata: {
    buildId: string;
    commitSha: string;
    processPid: number;
    startedAt: string;
  };
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
    this.runtimeMetadata = {
      buildId:
        process.env.APP_BUILD_ID?.trim() ||
        process.env.BUILD_ID?.trim() ||
        "dev",
      commitSha:
        process.env.APP_COMMIT_SHA?.trim() ||
        process.env.GIT_SHA?.trim() ||
        process.env.VERCEL_GIT_COMMIT_SHA?.trim() ||
        "unknown",
      processPid: process.pid,
      startedAt: new Date().toISOString(),
    };
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
    const startedAt = input.startedAt ?? new Date();
    const completedAt =
      input.completedAt ??
      (input.status === "running" ? null : new Date());

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
      startedAt,
      completedAt,
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

  async recordDeepResearchCheckpoint(
    input: RecordDeepResearchCheckpointInput,
  ): Promise<void> {
    const status = input.status.trim().toLowerCase();
    if (!status || !input.responseId?.trim()) {
      return;
    }

    const phaseRetryCount = this.normalizeNonNegativeInt(input.phaseRetryCount, 0);
    const mappedStatus = this.mapDeepResearchStatus(status);

    await this.recordRun({
      startupId: input.startupId,
      pipelineRunId: input.pipelineRunId,
      phase: input.phase,
      agentKey: input.agentKey,
      traceKind: "phase_step",
      stepKey: OPENAI_DEEP_RESEARCH_STEP_KEY,
      status: mappedStatus,
      attempt: phaseRetryCount + 1,
      retryCount: phaseRetryCount,
      meta: {
        deepResearch: {
          responseId: input.responseId.trim(),
          status,
          ...(input.modelName ? { modelName: input.modelName } : {}),
          resumed: Boolean(input.resumed),
          ...(typeof input.pollIntervalMs === "number"
            ? { pollIntervalMs: Math.max(1, Math.floor(input.pollIntervalMs)) }
            : {}),
          ...(typeof input.timeoutMs === "number"
            ? { timeoutMs: Math.max(1, Math.floor(input.timeoutMs)) }
            : {}),
          phaseRetryCount,
          ...(input.agentAttemptId ? { agentAttemptId: input.agentAttemptId } : {}),
          ...(input.checkpointEvent ? { checkpointEvent: input.checkpointEvent } : {}),
          lastPolledAt: new Date().toISOString(),
        },
      },
    });
  }

  async getLatestDeepResearchCheckpoint(
    input: FindDeepResearchCheckpointInput,
  ): Promise<DeepResearchCheckpoint | null> {
    const [row] = await this.drizzle.db
      .select({
        meta: pipelineAgentRun.meta,
        startedAt: pipelineAgentRun.startedAt,
        completedAt: pipelineAgentRun.completedAt,
      })
      .from(pipelineAgentRun)
      .where(
        and(
          eq(pipelineAgentRun.startupId, input.startupId),
          eq(pipelineAgentRun.pipelineRunId, input.pipelineRunId),
          eq(pipelineAgentRun.phase, input.phase),
          eq(pipelineAgentRun.agentKey, input.agentKey),
          eq(pipelineAgentRun.traceKind, "phase_step"),
          eq(pipelineAgentRun.stepKey, OPENAI_DEEP_RESEARCH_STEP_KEY),
        ),
      )
      .orderBy(
        desc(pipelineAgentRun.startedAt),
        desc(pipelineAgentRun.createdAt),
      )
      .limit(1);

    const parsed = this.readDeepResearchMeta(row?.meta);
    if (!parsed) {
      return null;
    }

    return {
      responseId: parsed.responseId,
      status: parsed.status,
      modelName: parsed.modelName,
      resumed: Boolean(parsed.resumed),
      pollIntervalMs: parsed.pollIntervalMs,
      timeoutMs: parsed.timeoutMs,
      phaseRetryCount: this.normalizeNonNegativeInt(parsed.phaseRetryCount, 0),
      agentAttemptId: parsed.agentAttemptId,
      checkpointEvent: parsed.checkpointEvent,
      startedAt: row?.startedAt,
      completedAt: row?.completedAt ?? undefined,
    };
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
    const baseNormalized = this.normalizeJsonField(
      value ?? {},
      this.metaByteLimit,
    );
    const base =
      baseNormalized &&
      typeof baseNormalized === "object" &&
      !Array.isArray(baseNormalized)
        ? (baseNormalized as Record<string, unknown>)
        : {};

    const withRuntime = this.withRuntimeMetadata(base);
    const normalized = this.normalizeJsonField(withRuntime, this.metaByteLimit);
    if (!normalized || typeof normalized !== "object" || Array.isArray(normalized)) {
      return { runtime: this.runtimeMetadata };
    }

    return normalized as Record<string, unknown>;
  }

  private withRuntimeMetadata(
    meta: Record<string, unknown>,
  ): Record<string, unknown> {
    const runtimeCandidate = meta.runtime;
    const runtimeMeta =
      runtimeCandidate &&
      typeof runtimeCandidate === "object" &&
      !Array.isArray(runtimeCandidate)
        ? (runtimeCandidate as Record<string, unknown>)
        : {};

    const { runtime: _runtime, ...rest } = meta;
    return {
      runtime: {
        ...runtimeMeta,
        ...this.runtimeMetadata,
      },
      ...rest,
    };
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
    fallbackReason: PipelineFallbackReason | undefined,
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

  private mapDeepResearchStatus(status: string): AgentRunStatus {
    if (status === "completed") {
      return "completed";
    }
    if (
      status === "failed" ||
      status === "cancelled" ||
      status === "incomplete" ||
      status === "expired"
    ) {
      return "failed";
    }
    return "running";
  }

  private readDeepResearchMeta(meta: unknown): DeepResearchMeta | null {
    if (!meta || typeof meta !== "object" || Array.isArray(meta)) {
      return null;
    }

    const root = meta as Record<string, unknown>;
    const deepResearch = root.deepResearch;
    if (
      !deepResearch ||
      typeof deepResearch !== "object" ||
      Array.isArray(deepResearch)
    ) {
      return null;
    }

    const record = deepResearch as Record<string, unknown>;
    const responseId = record.responseId;
    const status = record.status;
    if (
      typeof responseId !== "string" ||
      responseId.trim().length === 0 ||
      typeof status !== "string" ||
      status.trim().length === 0
    ) {
      return null;
    }

    return {
      responseId: responseId.trim(),
      status: status.trim().toLowerCase(),
      ...(typeof record.modelName === "string" ? { modelName: record.modelName } : {}),
      ...(typeof record.resumed === "boolean" ? { resumed: record.resumed } : {}),
      ...(typeof record.pollIntervalMs === "number"
        ? { pollIntervalMs: record.pollIntervalMs }
        : {}),
      ...(typeof record.timeoutMs === "number" ? { timeoutMs: record.timeoutMs } : {}),
      ...(typeof record.phaseRetryCount === "number"
        ? { phaseRetryCount: record.phaseRetryCount }
        : {}),
      ...(typeof record.agentAttemptId === "string"
        ? { agentAttemptId: record.agentAttemptId }
        : {}),
      ...(typeof record.checkpointEvent === "string"
        ? { checkpointEvent: record.checkpointEvent }
        : {}),
      ...(typeof record.lastPolledAt === "string"
        ? { lastPolledAt: record.lastPolledAt }
        : {}),
    };
  }
}
