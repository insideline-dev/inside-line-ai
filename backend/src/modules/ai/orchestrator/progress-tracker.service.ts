import { Injectable, Logger } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { DrizzleService } from "../../../database";
import { NotificationGateway } from "../../../notification/notification.gateway";
import { startupEvaluation } from "../../analysis/entities";
import {
  PhaseStatus,
  PipelinePhase,
  PipelineStatus,
} from "../interfaces/pipeline.interface";
import { isPhaseTerminal } from "./pipeline.config";

const AgentProgressSchema = z.object({
  key: z.string(),
  status: z.enum(["pending", "running", "completed", "failed"]),
  startedAt: z.string().optional(),
  completedAt: z.string().optional(),
  progress: z.number().optional(),
  error: z.string().optional(),
});

const PhaseProgressSchema = z.object({
  status: z.nativeEnum(PhaseStatus),
  startedAt: z.string().optional(),
  completedAt: z.string().optional(),
  error: z.string().optional(),
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
  estimatedTimeRemaining: z.number().optional(),
  error: z.string().optional(),
  updatedAt: z.string(),
});

type AgentProgress = z.infer<typeof AgentProgressSchema>;
type PhaseProgress = z.infer<typeof PhaseProgressSchema>;
export type PipelineProgressPayload = z.infer<typeof PipelineProgressPayloadSchema>;

type PhaseEventName = "phase:started" | "phase:completed" | "phase:failed" | "phase:waiting" | "phase:skipped" | "phase:updated";
type PipelineStatusEventName = "pipeline:completed" | "pipeline:failed" | "pipeline:cancelled" | "pipeline:updated";

@Injectable()
export class ProgressTrackerService {
  private readonly logger = new Logger(ProgressTrackerService.name);

  constructor(
    private drizzle: DrizzleService,
    private notifications: NotificationGateway,
  ) {}

  async initProgress(params: {
    startupId: string;
    userId: string;
    pipelineRunId: string;
    phases: PipelinePhase[];
  }): Promise<PipelineProgressPayload> {
    const now = new Date().toISOString();
    const phaseSet = new Set(params.phases);
    const phases = this.createInitialPhases(phaseSet);

    const payload: PipelineProgressPayload = {
      pipelineRunId: params.pipelineRunId,
      startupId: params.startupId,
      status: PipelineStatus.RUNNING,
      currentPhase: params.phases[0] ?? PipelinePhase.EXTRACTION,
      overallProgress: 0,
      phasesCompleted: [],
      phases,
      updatedAt: now,
    };

    await this.persistProgress(params.startupId, payload);
    this.notifications.sendPipelineEvent(params.userId, "pipeline:started", {
      startupId: params.startupId,
      pipelineRunId: params.pipelineRunId,
    });
    return payload;
  }

  async updatePhaseProgress(params: {
    startupId: string;
    userId: string;
    pipelineRunId: string;
    phase: PipelinePhase;
    status: PhaseStatus;
    error?: string;
  }): Promise<PipelineProgressPayload> {
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
    if (params.status === PhaseStatus.RUNNING && !phase.startedAt) {
      phase.startedAt = now;
      payload.currentPhase = params.phase;
    }
    if (isPhaseTerminal(params.status)) {
      phase.completedAt = now;
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
      .filter(([, value]) => value.status === PhaseStatus.COMPLETED)
      .map(([phaseName]) => phaseName);
    payload.overallProgress = Math.round(
      (payload.phasesCompleted.length / Object.keys(payload.phases).length) *
        100,
    );
    payload.estimatedTimeRemaining = this.estimateTimeRemaining(payload);
    payload.updatedAt = now;

    await this.persistProgress(params.startupId, payload);
    this.emitPhaseEvent(params.userId, params.startupId, params.phase, phase);
    return payload;
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
  }): Promise<void> {
    const payload = await this.ensureProgress(
      params.startupId,
      params.pipelineRunId,
    );
    const now = new Date().toISOString();
    const phase = payload.phases[params.phase] ?? {
      status: PhaseStatus.PENDING,
      agents: {},
    };

    const existing = phase.agents[params.key] ?? {
      key: params.key,
      status: "pending" as const,
    };
    const next: AgentProgress = {
      ...existing,
      key: params.key,
      status: params.status,
    };

    if (params.status === "running" && !next.startedAt) {
      next.startedAt = now;
    }
    if (params.status === "completed" || params.status === "failed") {
      next.completedAt = now;
    }
    if (typeof params.progress === "number") {
      next.progress = params.progress;
    }
    if (params.error) {
      next.error = params.error;
    }

    phase.agents[params.key] = next;
    payload.phases[params.phase] = phase;
    payload.updatedAt = now;

    await this.persistProgress(params.startupId, payload);

    const event: "agent:completed" | "agent:progress" = next.status === "completed" ? "agent:completed" : "agent:progress";
    this.notifications.sendPipelineEvent(params.userId, event, {
      startupId: params.startupId,
      phase: params.phase,
      agent: next,
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
    const payload = await this.ensureProgress(
      params.startupId,
      params.pipelineRunId,
    );
    payload.status = params.status;
    payload.currentPhase = params.currentPhase ?? payload.currentPhase;
    if (params.status === PipelineStatus.COMPLETED) {
      payload.overallProgress = 100;
    }
    if (params.error) {
      payload.error = params.error;
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

    const parsed = this.parseProgressPayload(row.analysisProgress);
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
          agents: {},
        };
        return acc;
      },
      {} as Record<PipelinePhase, PhaseProgress>,
    );
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

  private emitPhaseEvent(
    userId: string,
    startupId: string,
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

  private parseProgressPayload(value: unknown): { data: PipelineProgressPayload } | { error: string } {
    const result = PipelineProgressPayloadSchema.safeParse(value);
    if (result.success) return { data: result.data };
    return { error: result.error.message };
  }
}
