import { Injectable, Logger } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { DrizzleService } from "../../../database";
import { NotificationGateway } from "../../../notification/notification.gateway";
import { startupEvaluation } from "../../analysis/entities";
import type { PipelineFallbackReason } from "../interfaces/agent.interface";
import {
  PhaseStatus,
  PipelinePhase,
  PipelineStatus,
} from "../interfaces/pipeline.interface";
import { isPhaseTerminal } from "./pipeline.config";

const FallbackReasonSchema = z.enum([
  "EMPTY_STRUCTURED_OUTPUT",
  "TIMEOUT",
  "SCHEMA_OUTPUT_INVALID",
  "MODEL_OR_PROVIDER_ERROR",
  "UNHANDLED_AGENT_EXCEPTION",
  "MISSING_PROVIDER_EVIDENCE",
  "MISSING_BRAVE_TOOL_CALL",
]);
const DataSummarySchema = z.record(z.string(), z.unknown());

const AgentLifecycleEventSchema = z.object({
  id: z.string(),
  pipelineRunId: z.string(),
  phase: z.nativeEnum(PipelinePhase),
  agentKey: z.string(),
  event: z.enum(["started", "retrying", "completed", "failed", "fallback"]),
  timestamp: z.string(),
  attempt: z.number().int().min(1).optional(),
  retryCount: z.number().int().min(0).optional(),
  phaseRetryCount: z.number().int().min(0).optional(),
  agentAttemptId: z.string().optional(),
  error: z.string().optional(),
  fallbackReason: FallbackReasonSchema.optional(),
  rawProviderError: z.string().optional(),
});

const AgentProgressSchema = z.object({
  key: z.string(),
  status: z.enum(["pending", "running", "completed", "failed"]),
  startedAt: z.string().optional(),
  completedAt: z.string().optional(),
  progress: z.number().optional(),
  error: z.string().optional(),
  attempts: z.number().int().min(0).optional(),
  retryCount: z.number().int().min(0).optional(),
  phaseRetryCount: z.number().int().min(0).optional(),
  agentAttemptId: z.string().optional(),
  usedFallback: z.boolean().optional(),
  fallbackReason: FallbackReasonSchema.optional(),
  rawProviderError: z.string().optional(),
  lastEvent: z.enum(["started", "retrying", "completed", "failed", "fallback"]).optional(),
  lastEventAt: z.string().optional(),
  dataSummary: DataSummarySchema.optional(),
});

const PhaseProgressSchema = z.object({
  status: z.nativeEnum(PhaseStatus),
  startedAt: z.string().optional(),
  completedAt: z.string().optional(),
  error: z.string().optional(),
  retryCount: z.number().int().min(0).optional(),
  agents: z.record(z.string(), AgentProgressSchema),
});

const PipelineProgressPayloadSchema = z.object({
  pipelineRunId: z.string(),
  startupId: z.string(),
  status: z.nativeEnum(PipelineStatus),
  currentPhase: z.nativeEnum(PipelinePhase),
  overallProgress: z.number(),
  phasesCompleted: z.array(z.nativeEnum(PipelinePhase)),
  phases: z.record(z.nativeEnum(PipelinePhase), PhaseProgressSchema),
  agentEvents: z.array(AgentLifecycleEventSchema).default([]),
  estimatedTimeRemaining: z.number().optional(),
  error: z.string().optional(),
  updatedAt: z.string(),
});

type AgentProgress = z.infer<typeof AgentProgressSchema>;
type PhaseProgress = z.infer<typeof PhaseProgressSchema>;
type AgentLifecycleEvent = z.infer<typeof AgentLifecycleEventSchema>;
export type PipelineProgressPayload = z.infer<typeof PipelineProgressPayloadSchema>;

type PhaseEventName = "phase:started" | "phase:completed" | "phase:failed" | "phase:waiting" | "phase:skipped" | "phase:updated";
type PipelineStatusEventName = "pipeline:completed" | "pipeline:failed" | "pipeline:cancelled" | "pipeline:updated";

@Injectable()
export class ProgressTrackerService {
  private readonly logger = new Logger(ProgressTrackerService.name);
  private readonly mutationQueues = new Map<string, Promise<void>>();

  constructor(
    private drizzle: DrizzleService,
    private notifications: NotificationGateway,
  ) {}

  async initProgress(params: {
    startupId: string;
    userId: string;
    pipelineRunId: string;
    phases: PipelinePhase[];
    initialPhaseStatuses?: Partial<Record<PipelinePhase, PhaseStatus>>;
    currentPhase?: PipelinePhase;
  }): Promise<PipelineProgressPayload> {
    return this.withMutationLock(params.startupId, async () => {
      const now = new Date().toISOString();
      const phaseSet = new Set(params.phases);
      const phases = this.createInitialPhases(phaseSet);

      if (params.initialPhaseStatuses) {
        for (const phase of Object.values(PipelinePhase)) {
          const seededStatus = params.initialPhaseStatuses[phase];
          if (!seededStatus) {
            continue;
          }
          const seeded = phases[phase];
          seeded.status = seededStatus;
          if (seededStatus === PhaseStatus.RUNNING || seededStatus === PhaseStatus.WAITING) {
            seeded.startedAt = now;
          }
          if (isPhaseTerminal(seededStatus)) {
            seeded.completedAt = now;
          }
        }
      }

      const phasesCompleted = (Object.entries(phases) as Array<
        [PipelinePhase, PhaseProgress]
      >)
        .filter(([, value]) => isPhaseTerminal(value.status))
        .map(([phase]) => phase);
      const overallProgress = Math.round(
        (phasesCompleted.length / Object.keys(phases).length) * 100,
      );

      const payload: PipelineProgressPayload = {
        pipelineRunId: params.pipelineRunId,
        startupId: params.startupId,
        status: PipelineStatus.RUNNING,
        currentPhase: params.currentPhase ?? (params.phases[0] ?? PipelinePhase.EXTRACTION),
        overallProgress,
        phasesCompleted,
        phases,
        agentEvents: [],
        updatedAt: now,
      };

      if (!params.currentPhase) {
        payload.currentPhase = this.resolveCurrentPhase(payload, payload.currentPhase);
      }

      await this.persistProgress(params.startupId, payload);
      this.notifications.sendPipelineEvent(params.userId, "pipeline:started", {
        startupId: params.startupId,
        pipelineRunId: params.pipelineRunId,
      });
      return payload;
    });
  }

  async updatePhaseProgress(params: {
    startupId: string;
    userId: string;
    pipelineRunId: string;
    phase: PipelinePhase;
    status: PhaseStatus;
    error?: string;
    retryCount?: number;
  }): Promise<PipelineProgressPayload> {
    return this.withMutationLock(params.startupId, async () => {
      const payload = await this.ensureProgress(
        params.startupId,
        params.pipelineRunId,
      );
      const now = new Date().toISOString();

      const phase = payload.phases[params.phase] ?? {
        status: PhaseStatus.PENDING,
        agents: {},
      };

      phase.status = params.status;
      if (typeof params.retryCount === "number") {
        phase.retryCount = Math.max(0, Math.floor(params.retryCount));
      } else if (typeof phase.retryCount !== "number") {
        phase.retryCount = 0;
      }
      if (params.status === PhaseStatus.RUNNING && !phase.startedAt) {
        phase.startedAt = now;
        payload.currentPhase = params.phase;
        this.logger.log(
          `[Pipeline] 🚀 STARTING ${params.phase} phase | Startup: ${params.startupId}`,
        );
      }
      if (isPhaseTerminal(params.status)) {
        phase.completedAt = now;
        const duration =
          (new Date(now).getTime() -
            new Date(phase.startedAt || now).getTime()) /
          1000;
        if (params.status === PhaseStatus.COMPLETED) {
          this.logger.log(
            `[Pipeline] ✅ COMPLETED ${params.phase} phase in ${duration}s | Startup: ${params.startupId}`,
          );
        } else if (params.status === PhaseStatus.FAILED) {
          this.logger.error(
            `[Pipeline] ❌ FAILED ${params.phase} phase after ${duration}s | Error: ${params.error} | Startup: ${params.startupId}`,
          );
        }
      }
      if (params.error) {
        phase.error = params.error;
      } else if (params.status !== PhaseStatus.FAILED) {
        delete phase.error;
      }

      payload.phases[params.phase] = phase;
      payload.phasesCompleted = (Object.entries(payload.phases) as Array<
        [PipelinePhase, PhaseProgress]
      >)
        .filter(([, value]) => isPhaseTerminal(value.status))
        .map(([phaseName]) => phaseName);
      payload.overallProgress = Math.round(
        (payload.phasesCompleted.length / Object.keys(payload.phases).length) *
          100,
      );
      payload.currentPhase = this.resolveCurrentPhase(payload, params.phase);
      payload.estimatedTimeRemaining = this.estimateTimeRemaining(payload);
      payload.updatedAt = now;

      this.logger.debug(
        `[Pipeline] Progress: ${payload.overallProgress}% | Completed: ${payload.phasesCompleted.join(", ") || "none"} | Next: ${payload.currentPhase}`,
      );

      await this.persistProgress(params.startupId, payload);
      this.emitPhaseEvent(
        params.userId,
        params.startupId,
        params.pipelineRunId,
        params.phase,
        phase,
      );
      return payload;
    });
  }

  async resetPhasesForRerun(params: {
    startupId: string;
    userId: string;
    pipelineRunId: string;
    phases: PipelinePhase[];
  }): Promise<PipelineProgressPayload> {
    return this.withMutationLock(params.startupId, async () => {
      const payload = await this.ensureProgress(
        params.startupId,
        params.pipelineRunId,
      );
      const now = new Date().toISOString();
      const uniquePhases = [...new Set(params.phases)];

      for (const phaseName of uniquePhases) {
        payload.phases[phaseName] = {
          status: PhaseStatus.PENDING,
          retryCount: 0,
          agents: {},
        };
      }

      payload.phasesCompleted = (Object.entries(payload.phases) as Array<
        [PipelinePhase, PhaseProgress]
      >)
        .filter(([, value]) => isPhaseTerminal(value.status))
        .map(([phaseName]) => phaseName);
      payload.overallProgress = Math.round(
        (payload.phasesCompleted.length / Object.keys(payload.phases).length) *
          100,
      );
      payload.currentPhase = this.resolveCurrentPhase(payload, payload.currentPhase);
      payload.estimatedTimeRemaining = this.estimateTimeRemaining(payload);
      payload.updatedAt = now;

      await this.persistProgress(params.startupId, payload);

      for (const phaseName of uniquePhases) {
        this.emitPhaseEvent(
          params.userId,
          params.startupId,
          params.pipelineRunId,
          phaseName,
          payload.phases[phaseName],
        );
      }

      this.logger.debug(
        `[Pipeline] Batched rerun reset progress for phases: ${uniquePhases.join(", ") || "none"} | Startup: ${params.startupId} | Run: ${params.pipelineRunId}`,
      );

      return payload;
    });
  }

  async updateAgentProgress(params: {
    startupId: string;
    userId: string;
    pipelineRunId: string;
    phase: PipelinePhase;
    key: string;
    status: "pending" | "running" | "completed" | "failed";
    progress?: number;
    error?: string;
    attempt?: number;
    retryCount?: number;
    phaseRetryCount?: number;
    agentAttemptId?: string;
    usedFallback?: boolean;
    fallbackReason?: PipelineFallbackReason;
    rawProviderError?: string;
    lifecycleEvent?: "started" | "retrying" | "completed" | "failed" | "fallback";
    dataSummary?: Record<string, unknown>;
  }): Promise<void> {
    await this.withMutationLock(params.startupId, async () => {
      const payload = await this.ensureProgress(
        params.startupId,
        params.pipelineRunId,
      );
      const now = new Date().toISOString();
      const phase = payload.phases[params.phase] ?? {
        status: PhaseStatus.PENDING,
        agents: {},
      };
      const incomingPhaseRetryCount =
        typeof params.phaseRetryCount === "number" && Number.isFinite(params.phaseRetryCount)
          ? Math.max(0, Math.floor(params.phaseRetryCount))
          : Math.max(0, Math.floor(phase.retryCount ?? 0));
      const currentPhaseRetryCount = Math.max(
        0,
        Math.floor(phase.retryCount ?? 0),
      );
      if (incomingPhaseRetryCount < currentPhaseRetryCount) {
        this.logger.debug(
          `[Pipeline] Ignoring stale agent update for ${params.key} in ${params.phase}: incoming phase retry ${incomingPhaseRetryCount} < current ${currentPhaseRetryCount}`,
        );
        return;
      }
      if (incomingPhaseRetryCount > currentPhaseRetryCount) {
        phase.retryCount = incomingPhaseRetryCount;
        phase.agents = {};
      } else if (typeof phase.retryCount !== "number") {
        phase.retryCount = incomingPhaseRetryCount;
      }

      const existing = phase.agents[params.key] ?? {
        key: params.key,
        status: "pending" as const,
      };
      const incomingAgentAttemptId =
        typeof params.agentAttemptId === "string" &&
        params.agentAttemptId.trim().length > 0
          ? params.agentAttemptId.trim()
          : undefined;
      const isDifferentAttempt =
        Boolean(existing.agentAttemptId) &&
        Boolean(incomingAgentAttemptId) &&
        existing.agentAttemptId !== incomingAgentAttemptId;
      const next: AgentProgress = {
        ...existing,
        key: params.key,
        status: params.status,
      };
      const lifecycleEvent =
        params.lifecycleEvent ??
        (params.status === "running"
          ? "started"
          : params.status === "completed"
            ? "completed"
            : "failed");

      if (
        this.isAgentTerminalStatus(existing.status) &&
        !this.isAgentTerminalStatus(params.status)
      ) {
        if (isDifferentAttempt) {
          this.logger.debug(
            `[Pipeline] Ignoring stale non-terminal update for agent ${params.key} in ${params.phase} (existing attempt=${existing.agentAttemptId}, incoming attempt=${incomingAgentAttemptId})`,
          );
          return;
        }
        this.logger.debug(
          `[Pipeline] Ignoring stale non-terminal update for agent ${params.key} in ${params.phase} (existing=${existing.status}, incoming=${params.status}, lifecycle=${lifecycleEvent})`,
        );
        return;
      }

      if (isDifferentAttempt && params.status === "running") {
        next.startedAt = now;
        delete next.completedAt;
        delete next.error;
        next.progress = 0;
      }

      if (params.status === "running" && !next.startedAt) {
        next.startedAt = now;
        this.logger.log(
          `[Pipeline] 🤖 Agent running: ${params.key} | Phase: ${params.phase}`,
        );
      }
      if (params.status === "completed" || params.status === "failed") {
        next.completedAt = now;
        const duration =
          (new Date(now).getTime() -
            new Date(next.startedAt || now).getTime()) /
          1000;
        if (params.status === "completed") {
          this.logger.log(
            `[Pipeline] ✅ Agent completed: ${params.key} in ${duration}s | Phase: ${params.phase}`,
          );
        } else {
          this.logger.error(
            `[Pipeline] ❌ Agent failed: ${params.key} | Error: ${params.error} | Phase: ${params.phase}`,
          );
        }
      }
      if (typeof params.progress === "number") {
        next.progress = params.progress;
        this.logger.debug(
          `[Pipeline] Agent ${params.key} progress: ${params.progress}%`,
        );
      }
      if (params.error) {
        next.error = params.error;
      } else if (params.status === "completed" && !params.usedFallback) {
        delete next.error;
      }
      if (typeof params.attempt === "number") {
        next.attempts = Math.max(
          next.attempts ?? 0,
          Math.max(1, Math.floor(params.attempt)),
        );
      } else if (
        params.status === "running" &&
        typeof next.attempts !== "number"
      ) {
        next.attempts = 1;
      }
      if (typeof params.retryCount === "number") {
        next.retryCount = Math.max(0, Math.floor(params.retryCount));
      } else if (lifecycleEvent === "retrying") {
        next.retryCount = Math.max(0, (next.retryCount ?? 0) + 1);
      } else if (typeof next.retryCount !== "number") {
        next.retryCount = 0;
      }
      if (params.usedFallback === true) {
        next.usedFallback = true;
      } else if (params.usedFallback === false && lifecycleEvent !== "fallback") {
        next.usedFallback = false;
      }
      if (params.fallbackReason) {
        next.fallbackReason = params.fallbackReason;
      } else if (!next.usedFallback) {
        delete next.fallbackReason;
      }
      if (params.rawProviderError) {
        next.rawProviderError = params.rawProviderError;
      } else if (!next.usedFallback) {
        delete next.rawProviderError;
      }
      if (params.dataSummary) {
        next.dataSummary = params.dataSummary;
      }
      next.lastEvent = lifecycleEvent;
      next.lastEventAt = now;
      next.phaseRetryCount = incomingPhaseRetryCount;
      if (incomingAgentAttemptId) {
        next.agentAttemptId = incomingAgentAttemptId;
      } else if (!next.agentAttemptId) {
        next.agentAttemptId = `${params.pipelineRunId}:${params.phase}:${params.key}:phase-${incomingPhaseRetryCount}:attempt-${next.attempts ?? 1}`;
      }

      phase.agents[params.key] = next;
      payload.phases[params.phase] = phase;
      payload.agentEvents = this.appendAgentEvent(payload.agentEvents ?? [], {
        id: `${now}:${params.phase}:${params.key}:${lifecycleEvent}:${next.agentAttemptId ?? "na"}:${next.attempts ?? 1}:${next.retryCount ?? 0}`,
        pipelineRunId: params.pipelineRunId,
        phase: params.phase,
        agentKey: params.key,
        event: lifecycleEvent,
        timestamp: now,
        attempt:
          typeof params.attempt === "number"
            ? Math.max(1, Math.floor(params.attempt))
            : next.attempts,
        retryCount: next.retryCount,
        phaseRetryCount: next.phaseRetryCount,
        agentAttemptId: next.agentAttemptId,
        error: params.error,
        fallbackReason: params.fallbackReason ?? next.fallbackReason,
        rawProviderError: params.rawProviderError ?? next.rawProviderError,
      });
      payload.updatedAt = now;

      await this.persistProgress(params.startupId, payload);

      const event: "agent:completed" | "agent:progress" =
        next.status === "completed" ? "agent:completed" : "agent:progress";
      const publicAgentPayload = {
        key: next.key,
        status: next.status,
        startedAt: next.startedAt,
        completedAt: next.completedAt,
        progress: next.progress,
        error: next.error,
        attempts: next.attempts,
        retryCount: next.retryCount,
        phaseRetryCount: next.phaseRetryCount,
        agentAttemptId: next.agentAttemptId,
        usedFallback: next.usedFallback,
        fallbackReason: next.fallbackReason,
        rawProviderError: next.rawProviderError,
        lastEvent: next.lastEvent,
        lastEventAt: next.lastEventAt,
        dataSummary: next.dataSummary,
      };
      this.notifications.sendPipelineEvent(params.userId, event, {
        startupId: params.startupId,
        pipelineRunId: params.pipelineRunId,
        phase: params.phase,
        agent: publicAgentPayload,
      });
    });
  }

  async setPipelineStatus(params: {
    startupId: string;
    userId: string;
    pipelineRunId: string;
    status: PipelineStatus;
    currentPhase?: PipelinePhase;
    error?: string;
    overallScore?: number;
  }): Promise<PipelineProgressPayload> {
    return this.withMutationLock(params.startupId, async () => {
      const payload = await this.ensureProgress(
        params.startupId,
        params.pipelineRunId,
      );
      payload.status = params.status;
      payload.currentPhase = params.currentPhase ?? payload.currentPhase;
      if (params.status === PipelineStatus.COMPLETED) {
        payload.overallProgress = 100;
        const totalTime = Object.values(payload.phases).reduce(
          (sum, phase) => {
            if (phase.startedAt && phase.completedAt) {
              return (
                sum +
                (new Date(phase.completedAt).getTime() -
                  new Date(phase.startedAt).getTime())
              );
            }
            return sum;
          },
          0,
        ) / 1000;
        this.logger.log(
          `[Pipeline] 🎉 PIPELINE COMPLETED | Total time: ${totalTime}s | Overall score: ${params.overallScore ?? "N/A"} | Startup: ${params.startupId}`,
        );
      }
      if (params.error) {
        payload.error = params.error;
        if (params.status === PipelineStatus.COMPLETED) {
          this.logger.warn(
            `[Pipeline] ⚠️ PIPELINE COMPLETED WITH WARNINGS | Warning: ${params.error} | Startup: ${params.startupId}`,
          );
        } else {
          this.logger.error(
            `[Pipeline] ❌ PIPELINE FAILED | Error: ${params.error} | Startup: ${params.startupId}`,
          );
        }
      } else if (params.status === PipelineStatus.COMPLETED) {
        delete payload.error;
      }
      payload.updatedAt = new Date().toISOString();

      await this.persistProgress(params.startupId, payload);
      const event = this.pipelineStatusEvent(params.status);
      this.notifications.sendPipelineEvent(params.userId, event, {
        startupId: params.startupId,
        pipelineRunId: params.pipelineRunId,
        status: params.status,
        overallScore: params.overallScore,
        error: params.error,
      });
      return payload;
    });
  }

  private async withMutationLock<T>(
    startupId: string,
    task: () => Promise<T>,
  ): Promise<T> {
    const previous = this.mutationQueues.get(startupId) ?? Promise.resolve();
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const queued = previous.finally(() => gate);
    this.mutationQueues.set(startupId, queued);

    await previous;
    try {
      return await task();
    } finally {
      release?.();
      if (this.mutationQueues.get(startupId) === queued) {
        this.mutationQueues.delete(startupId);
      }
    }
  }

  async getProgress(startupId: string): Promise<PipelineProgressPayload | null> {
    const [row] = await this.drizzle.db
      .select({ analysisProgress: startupEvaluation.analysisProgress })
      .from(startupEvaluation)
      .where(eq(startupEvaluation.startupId, startupId))
      .limit(1);

    if (!row?.analysisProgress) {
      return null;
    }

    const parsed = this.parseProgressPayload(row.analysisProgress, startupId);
    if ("error" in parsed) {
      this.logger.warn(
        `Invalid analysisProgress for startup ${startupId}: ${parsed.error}`,
      );
      return null;
    }

    return parsed.data;
  }

  private async ensureProgress(
    startupId: string,
    pipelineRunId: string,
  ): Promise<PipelineProgressPayload> {
    const existing = await this.getProgress(startupId);
    if (existing) {
      return existing;
    }

    const phases = this.createInitialPhases(new Set(Object.values(PipelinePhase)));
    const payload: PipelineProgressPayload = {
      pipelineRunId,
      startupId,
      status: PipelineStatus.RUNNING,
      currentPhase: PipelinePhase.EXTRACTION,
      overallProgress: 0,
      phasesCompleted: [],
      phases,
      agentEvents: [],
      updatedAt: new Date().toISOString(),
    };
    await this.persistProgress(startupId, payload);
    return payload;
  }

  private createInitialPhases(
    phases: Set<PipelinePhase>,
  ): Record<PipelinePhase, PhaseProgress> {
    const allPhases = Object.values(PipelinePhase);
    return allPhases.reduce(
      (acc, phase) => {
        acc[phase] = {
          status: phases.has(phase) ? PhaseStatus.PENDING : PhaseStatus.SKIPPED,
          retryCount: 0,
          agents: {},
        };
        return acc;
      },
      {} as Record<PipelinePhase, PhaseProgress>,
    );
  }

  private appendAgentEvent(
    existing: AgentLifecycleEvent[],
    next: AgentLifecycleEvent,
  ): AgentLifecycleEvent[] {
    const MAX_EVENTS = 300;
    const duplicate = existing.some(
      (event) =>
        event.id === next.id ||
        (event.pipelineRunId === next.pipelineRunId &&
          event.phase === next.phase &&
          event.agentKey === next.agentKey &&
          event.event === next.event &&
          (event.agentAttemptId ?? null) === (next.agentAttemptId ?? null) &&
          (event.attempt ?? null) === (next.attempt ?? null) &&
          (event.retryCount ?? null) === (next.retryCount ?? null) &&
          (event.phaseRetryCount ?? null) === (next.phaseRetryCount ?? null) &&
          (event.error ?? null) === (next.error ?? null) &&
          (event.fallbackReason ?? null) === (next.fallbackReason ?? null)),
    );
    if (duplicate) {
      return existing;
    }

    const merged = [...existing, next];
    if (merged.length <= MAX_EVENTS) {
      return merged;
    }
    return merged.slice(merged.length - MAX_EVENTS);
  }

  private isAgentTerminalStatus(
    status: AgentProgress["status"] | "pending" | "running" | "completed" | "failed",
  ): boolean {
    return status === "completed" || status === "failed";
  }

  private estimateTimeRemaining(
    payload: PipelineProgressPayload,
  ): number | undefined {
    const completedDurations = Object.values(payload.phases)
      .filter(
        (phase) =>
          phase.status === PhaseStatus.COMPLETED &&
          phase.startedAt &&
          phase.completedAt,
      )
      .map(
        (phase) =>
          new Date(phase.completedAt as string).getTime() -
          new Date(phase.startedAt as string).getTime(),
      )
      .filter((value) => value > 0);

    if (!completedDurations.length) {
      return undefined;
    }

    const avgDuration =
      completedDurations.reduce((sum, value) => sum + value, 0) /
      completedDurations.length;
    const remainingCount = Object.values(payload.phases).filter(
      (phase) =>
        phase.status === PhaseStatus.PENDING ||
        phase.status === PhaseStatus.WAITING,
    ).length;

    return Math.max(0, Math.round((avgDuration * remainingCount) / 1000));
  }

  private resolveCurrentPhase(
    payload: PipelineProgressPayload,
    fallback: PipelinePhase,
  ): PipelinePhase {
    const orderedPhases = Object.values(PipelinePhase);

    const running = orderedPhases.find(
      (phase) => payload.phases[phase]?.status === PhaseStatus.RUNNING,
    );
    if (running) {
      return running;
    }

    const waiting = orderedPhases.find(
      (phase) => payload.phases[phase]?.status === PhaseStatus.WAITING,
    );
    if (waiting) {
      return waiting;
    }

    const pending = orderedPhases.find(
      (phase) => payload.phases[phase]?.status === PhaseStatus.PENDING,
    );
    if (pending) {
      return pending;
    }

    const completed = [...orderedPhases].reverse().find(
      (phase) => isPhaseTerminal(payload.phases[phase]?.status ?? PhaseStatus.PENDING),
    );
    return completed ?? fallback;
  }

  private emitPhaseEvent(
    userId: string,
    startupId: string,
    pipelineRunId: string,
    phase: PipelinePhase,
    phaseProgress: PhaseProgress,
  ): void {
    const event: PhaseEventName =
      phaseProgress.status === PhaseStatus.RUNNING
        ? "phase:started"
        : phaseProgress.status === PhaseStatus.COMPLETED
          ? "phase:completed"
          : phaseProgress.status === PhaseStatus.FAILED
            ? "phase:failed"
            : phaseProgress.status === PhaseStatus.WAITING
              ? "phase:waiting"
              : phaseProgress.status === PhaseStatus.SKIPPED
                ? "phase:skipped"
                : "phase:updated";

    this.notifications.sendPipelineEvent(userId, event, {
      startupId,
      pipelineRunId,
      phase,
      status: phaseProgress.status,
      error: phaseProgress.error,
    });
  }

  private pipelineStatusEvent(status: PipelineStatus): PipelineStatusEventName {
    if (status === PipelineStatus.COMPLETED) {
      return "pipeline:completed";
    }
    if (status === PipelineStatus.FAILED) {
      return "pipeline:failed";
    }
    if (status === PipelineStatus.CANCELLED) {
      return "pipeline:cancelled";
    }
    this.logger.debug(`Unhandled pipeline status event for ${status}`);
    return "pipeline:updated";
  }

  private async persistProgress(
    startupId: string,
    payload: PipelineProgressPayload,
  ): Promise<void> {
    await this.drizzle.db
      .insert(startupEvaluation)
      .values({
        startupId,
        analysisProgress: payload,
      })
      .onConflictDoUpdate({
        target: startupEvaluation.startupId,
        set: {
          analysisProgress: payload,
        },
      })
      .returning({ startupId: startupEvaluation.startupId });
  }

  private parseProgressPayload(
    value: unknown,
    startupId: string,
  ): { data: PipelineProgressPayload } | { error: string } {
    const result = PipelineProgressPayloadSchema.safeParse(value);
    if (result.success) return { data: result.data };

    const normalized = this.normalizeLegacyProgressPayload(value, startupId);
    if (normalized) {
      const normalizedResult = PipelineProgressPayloadSchema.safeParse(normalized);
      if (normalizedResult.success) {
        return { data: normalizedResult.data };
      }
    }

    return { error: result.error.message };
  }

  private normalizeLegacyProgressPayload(
    value: unknown,
    startupId: string,
  ): PipelineProgressPayload | null {
    if (!value || typeof value !== "object") {
      return null;
    }

    const record = value as Record<string, unknown>;

    const hasLegacyShape =
      typeof record.currentStage === "number" ||
      Array.isArray(record.stageProgress) ||
      (!!record.phases && typeof record.phases === "object") ||
      typeof record.pipelineStatus === "string" ||
      typeof record.status === "string" ||
      typeof record.currentPhase === "string" ||
      typeof record.overallProgress === "number" ||
      Array.isArray(record.phasesCompleted) ||
      typeof record.lastUpdatedAt === "string" ||
      typeof record.startedAt === "string" ||
      Array.isArray(record.completedAgents) ||
      typeof record.currentAgent === "string";
    if (!hasLegacyShape) {
      return null;
    }

    const nowIso = new Date().toISOString();
    const phases = this.createInitialPhases(new Set(Object.values(PipelinePhase)));

    const stageProgress = record.stageProgress;
    if (Array.isArray(stageProgress)) {
      for (const item of stageProgress) {
        if (!item || typeof item !== "object") {
          continue;
        }

        const phase = this.stageToPhase((item as { stage?: unknown }).stage);
        if (!phase) {
          continue;
        }

        const stageRecord = item as Record<string, unknown>;
        phases[phase] = {
          ...phases[phase],
          status: this.coercePhaseStatus(stageRecord.status),
          startedAt:
            typeof stageRecord.startedAt === "string"
              ? stageRecord.startedAt
              : undefined,
          completedAt:
            typeof stageRecord.completedAt === "string"
              ? stageRecord.completedAt
              : undefined,
        };
      }
    }

    if (record.phases && typeof record.phases === "object") {
      const phaseEntries = Object.entries(
        record.phases as Record<string, unknown>,
      );
      for (const [legacyKey, value] of phaseEntries) {
        if (!value || typeof value !== "object") {
          continue;
        }
        const phase = this.mapLegacyPhaseKey(legacyKey);
        if (!phase) {
          continue;
        }

        const phaseRecord = value as Record<string, unknown>;
        const currentAgents = phases[phase].agents;
        const mappedAgents = this.mapLegacyAgents(phaseRecord.agents);
        phases[phase] = {
          ...phases[phase],
          status: this.coercePhaseStatus(phaseRecord.status),
          startedAt:
            typeof phaseRecord.startedAt === "string"
              ? phaseRecord.startedAt
              : phases[phase].startedAt,
          completedAt:
            typeof phaseRecord.completedAt === "string"
              ? phaseRecord.completedAt
              : phases[phase].completedAt,
          error:
            typeof phaseRecord.error === "string" ? phaseRecord.error : undefined,
          retryCount:
            typeof phaseRecord.retryCount === "number"
              ? Math.max(0, Math.floor(phaseRecord.retryCount))
              : phases[phase].retryCount,
          agents:
            mappedAgents && Object.keys(mappedAgents).length > 0
              ? mappedAgents
              : currentAgents,
        };
      }
    }

    if (Array.isArray(record.phasesCompleted)) {
      for (const item of record.phasesCompleted) {
        if (typeof item !== "string") {
          continue;
        }
        const phase = this.mapLegacyPhaseKey(item);
        if (!phase) {
          continue;
        }
        phases[phase] = {
          ...phases[phase],
          status: PhaseStatus.COMPLETED,
        };
      }
    }

    const phasesCompleted = (
      Object.entries(phases) as Array<[PipelinePhase, PhaseProgress]>
    )
      .filter(([, phase]) => phase.status === PhaseStatus.COMPLETED)
      .map(([phase]) => phase);

    const currentStagePhase = this.stageToPhase(record.currentStage);
    const currentPhase =
      currentStagePhase ??
      this.coercePipelinePhase(record.currentPhase, phases) ??
      PipelinePhase.EXTRACTION;

    const overallProgress =
      typeof record.overallProgress === "number"
        ? this.normalizePercent(record.overallProgress)
        : this.normalizePercent(
            (phasesCompleted.length / Object.keys(phases).length) * 100,
          );

    const status =
      this.coercePipelineStatus(record.status) ??
      this.coercePipelineStatus(record.pipelineStatus) ??
      (overallProgress >= 100
        ? PipelineStatus.COMPLETED
        : PipelineStatus.RUNNING);

    const pipelineRunId =
      typeof record.pipelineRunId === "string" && record.pipelineRunId.trim()
        ? record.pipelineRunId
        : `legacy-${startupId}`;

    const resolvedStartupId =
      typeof record.startupId === "string" && record.startupId.trim()
        ? record.startupId
        : startupId;

    const updatedAt =
      typeof record.updatedAt === "string" && record.updatedAt.trim()
        ? record.updatedAt
        : typeof record.lastUpdatedAt === "string" && record.lastUpdatedAt.trim()
          ? record.lastUpdatedAt
          : nowIso;

    const error =
      typeof record.error === "string" && record.error.trim()
        ? record.error
        : undefined;

    return {
      pipelineRunId,
      startupId: resolvedStartupId,
      status,
      currentPhase,
      overallProgress,
      phasesCompleted,
      phases,
      agentEvents: [],
      updatedAt,
      error,
    };
  }

  private mapLegacyAgents(
    value: unknown,
  ): Record<string, AgentProgress> | null {
    if (!value || typeof value !== "object") {
      return null;
    }

    const entries = Object.entries(value as Record<string, unknown>);
    if (!entries.length) {
      return {};
    }

    const mapped: Record<string, AgentProgress> = {};

    for (const [key, raw] of entries) {
      if (!raw || typeof raw !== "object") {
        continue;
      }

      const record = raw as Record<string, unknown>;
      const status = this.coerceAgentStatus(record.status);
      mapped[key] = {
        key: typeof record.key === "string" ? record.key : key,
        status,
        progress:
          typeof record.progress === "number"
            ? this.normalizePercent(record.progress)
            : undefined,
        startedAt:
          typeof record.startedAt === "string" ? record.startedAt : undefined,
        completedAt:
          typeof record.completedAt === "string" ? record.completedAt : undefined,
        error: typeof record.error === "string" ? record.error : undefined,
        attempts:
          typeof record.attempts === "number"
            ? Math.max(0, Math.floor(record.attempts))
            : undefined,
        retryCount:
          typeof record.retryCount === "number"
            ? Math.max(0, Math.floor(record.retryCount))
            : undefined,
        phaseRetryCount:
          typeof record.phaseRetryCount === "number"
            ? Math.max(0, Math.floor(record.phaseRetryCount))
            : undefined,
        agentAttemptId:
          typeof record.agentAttemptId === "string"
            ? record.agentAttemptId
            : undefined,
        usedFallback:
          typeof record.usedFallback === "boolean"
            ? record.usedFallback
            : undefined,
        fallbackReason:
          record.fallbackReason === "EMPTY_STRUCTURED_OUTPUT" ||
          record.fallbackReason === "TIMEOUT" ||
          record.fallbackReason === "SCHEMA_OUTPUT_INVALID" ||
          record.fallbackReason === "MODEL_OR_PROVIDER_ERROR" ||
          record.fallbackReason === "UNHANDLED_AGENT_EXCEPTION" ||
          record.fallbackReason === "MISSING_PROVIDER_EVIDENCE" ||
          record.fallbackReason === "MISSING_BRAVE_TOOL_CALL"
            ? record.fallbackReason
            : undefined,
        rawProviderError:
          typeof record.rawProviderError === "string"
            ? record.rawProviderError
            : undefined,
        dataSummary:
          record.dataSummary &&
          typeof record.dataSummary === "object" &&
          !Array.isArray(record.dataSummary)
            ? (record.dataSummary as Record<string, unknown>)
            : undefined,
        lastEvent:
          record.lastEvent === "started" ||
          record.lastEvent === "retrying" ||
          record.lastEvent === "completed" ||
          record.lastEvent === "failed" ||
          record.lastEvent === "fallback"
            ? record.lastEvent
            : undefined,
        lastEventAt:
          typeof record.lastEventAt === "string" ? record.lastEventAt : undefined,
      };
    }

    return mapped;
  }

  private mapLegacyPhaseKey(value: string): PipelinePhase | null {
    if (value === PipelinePhase.EXTRACTION) return PipelinePhase.EXTRACTION;
    if (value === PipelinePhase.SCRAPING) return PipelinePhase.SCRAPING;
    if (value === PipelinePhase.RESEARCH) return PipelinePhase.RESEARCH;
    if (value === PipelinePhase.EVALUATION) return PipelinePhase.EVALUATION;
    if (value === PipelinePhase.SYNTHESIS) return PipelinePhase.SYNTHESIS;

    const normalized = value.trim().toLowerCase().replace(/[\s_]/g, "-");
    if (normalized.includes("extract")) return PipelinePhase.EXTRACTION;
    if (normalized.includes("scrap") || normalized.includes("website")) {
      return PipelinePhase.SCRAPING;
    }
    if (normalized.includes("research")) return PipelinePhase.RESEARCH;
    if (normalized.includes("evaluat") || normalized.includes("analysis")) {
      return PipelinePhase.EVALUATION;
    }
    if (normalized.includes("synth")) return PipelinePhase.SYNTHESIS;

    return null;
  }

  private stageToPhase(value: unknown): PipelinePhase | null {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return null;
    }
    if (value <= 1) return PipelinePhase.EXTRACTION;
    if (value === 2) return PipelinePhase.SCRAPING;
    if (value === 3) return PipelinePhase.RESEARCH;
    if (value === 4) return PipelinePhase.EVALUATION;
    if (value >= 5) return PipelinePhase.SYNTHESIS;
    return null;
  }

  private coercePipelineStatus(value: unknown): PipelineStatus | null {
    if (value === PipelineStatus.RUNNING) return PipelineStatus.RUNNING;
    if (value === PipelineStatus.COMPLETED) return PipelineStatus.COMPLETED;
    if (value === PipelineStatus.FAILED) return PipelineStatus.FAILED;
    if (value === PipelineStatus.CANCELLED) return PipelineStatus.CANCELLED;
    return null;
  }

  private coercePipelinePhase(
    value: unknown,
    phases: Record<PipelinePhase, PhaseProgress>,
  ): PipelinePhase | null {
    if (value === PipelinePhase.EXTRACTION) return PipelinePhase.EXTRACTION;
    if (value === PipelinePhase.SCRAPING) return PipelinePhase.SCRAPING;
    if (value === PipelinePhase.RESEARCH) return PipelinePhase.RESEARCH;
    if (value === PipelinePhase.EVALUATION) return PipelinePhase.EVALUATION;
    if (value === PipelinePhase.SYNTHESIS) return PipelinePhase.SYNTHESIS;
    if (typeof value === "string") {
      const mapped = this.mapLegacyPhaseKey(value);
      if (mapped) {
        return mapped;
      }
    }

    const running = (
      Object.entries(phases) as Array<[PipelinePhase, PhaseProgress]>
    ).find(([, phase]) => phase.status === PhaseStatus.RUNNING);
    if (running) {
      return running[0];
    }

    const waiting = (
      Object.entries(phases) as Array<[PipelinePhase, PhaseProgress]>
    ).find(([, phase]) => phase.status === PhaseStatus.WAITING);
    if (waiting) {
      return waiting[0];
    }

    const pending = (
      Object.entries(phases) as Array<[PipelinePhase, PhaseProgress]>
    ).find(([, phase]) => phase.status === PhaseStatus.PENDING);
    if (pending) {
      return pending[0];
    }

    return null;
  }

  private coercePhaseStatus(value: unknown): PhaseStatus {
    if (value === PhaseStatus.PENDING) return PhaseStatus.PENDING;
    if (value === PhaseStatus.WAITING) return PhaseStatus.WAITING;
    if (value === PhaseStatus.RUNNING) return PhaseStatus.RUNNING;
    if (value === PhaseStatus.COMPLETED) return PhaseStatus.COMPLETED;
    if (value === PhaseStatus.FAILED) return PhaseStatus.FAILED;
    if (value === PhaseStatus.SKIPPED) return PhaseStatus.SKIPPED;

    if (typeof value !== "string") {
      return PhaseStatus.PENDING;
    }

    const normalized = value.toLowerCase().replace(/[\s_]/g, "-");
    if (normalized === "in-progress" || normalized === "processing") {
      return PhaseStatus.RUNNING;
    }
    if (normalized === "done" || normalized === "success") {
      return PhaseStatus.COMPLETED;
    }
    if (normalized === "queued") {
      return PhaseStatus.WAITING;
    }
    return PhaseStatus.PENDING;
  }

  private coerceAgentStatus(
    value: unknown,
  ): "pending" | "running" | "completed" | "failed" {
    if (value === "pending") return "pending";
    if (value === "running") return "running";
    if (value === "completed") return "completed";
    if (value === "failed") return "failed";
    if (typeof value === "string" && value.toLowerCase() === "in-progress") {
      return "running";
    }
    return "pending";
  }

  private normalizePercent(value: number): number {
    if (!Number.isFinite(value)) {
      return 0;
    }
    return Math.max(0, Math.min(100, Math.round(value)));
  }
}
