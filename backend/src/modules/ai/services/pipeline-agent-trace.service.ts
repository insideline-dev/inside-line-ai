import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { and, eq, lt } from "drizzle-orm";
import { DrizzleService } from "../../../database";
import type { EvaluationFallbackReason } from "../interfaces/agent.interface";
import { PipelinePhase } from "../interfaces/pipeline.interface";
import { pipelineAgentRun } from "../entities";

type AgentRunStatus = "running" | "completed" | "failed" | "fallback";

export interface RecordPipelineAgentRunInput {
  startupId: string;
  pipelineRunId: string;
  phase: PipelinePhase;
  agentKey: string;
  status: AgentRunStatus;
  attempt?: number;
  retryCount?: number;
  usedFallback?: boolean;
  inputPrompt?: string;
  outputText?: string;
  outputJson?: unknown;
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
    this.retentionDays = this.config.get<number>(
      "AI_AGENT_TRACE_RETENTION_DAYS",
      30,
    );
  }

  async recordRun(input: RecordPipelineAgentRunInput): Promise<void> {
    const attempt = this.normalizeNonNegativeInt(input.attempt, 1);
    const retryCount = this.normalizeNonNegativeInt(
      input.retryCount,
      Math.max(0, attempt - 1),
    );
    const inputPrompt = this.truncateText(input.inputPrompt, this.promptCharLimit);
    const outputText = this.truncateText(input.outputText, this.outputCharLimit);
    const outputJson = this.attachTraceMeta(
      this.normalizeOutputJson(input.outputJson),
      input.fallbackReason,
      input.rawProviderError,
    );

    await this.drizzle.db.insert(pipelineAgentRun).values({
      startupId: input.startupId,
      pipelineRunId: input.pipelineRunId,
      phase: input.phase,
      agentKey: input.agentKey,
      status: input.status,
      attempt,
      retryCount,
      usedFallback: input.usedFallback ?? input.status === "fallback",
      inputPrompt,
      outputText,
      outputJson,
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

  private normalizeOutputJson(value: unknown): Record<string, unknown> | unknown[] | null {
    if (value === undefined) {
      return null;
    }

    try {
      const parsed = JSON.parse(JSON.stringify(value)) as unknown;
      if (!parsed || typeof parsed !== "object") {
        return null;
      }
      return parsed as Record<string, unknown> | unknown[];
    } catch {
      return null;
    }
  }

  private attachTraceMeta(
    outputJson: Record<string, unknown> | unknown[] | null,
    fallbackReason: EvaluationFallbackReason | undefined,
    rawProviderError: string | undefined,
  ): Record<string, unknown> | unknown[] | null {
    if (!outputJson || Array.isArray(outputJson)) {
      return outputJson;
    }
    if (!fallbackReason && !rawProviderError) {
      return outputJson;
    }
    return {
      ...outputJson,
      __traceMeta: {
        ...(fallbackReason ? { fallbackReason } : {}),
        ...(rawProviderError ? { rawProviderError } : {}),
      },
    };
  }

  private normalizeNonNegativeInt(value: number | undefined, fallback: number): number {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return fallback;
    }
    return Math.max(0, Math.floor(value));
  }
}
