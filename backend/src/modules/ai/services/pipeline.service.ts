import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { DrizzleService } from "../../../database";
import { QueueService } from "../../../queue";
import { startup, StartupStatus } from "../../startup/entities";
import { pipelineRun } from "../entities";
import { AiConfigService } from "./ai-config.service";
import { PipelineStateService } from "./pipeline-state.service";
import {
  PhaseStatus,
  PipelinePhase,
  PipelineState,
  PipelineStatus,
} from "../interfaces/pipeline.interface";
import { ErrorRecoveryService } from "../orchestrator/error-recovery.service";
import { PhaseTransitionService } from "../orchestrator/phase-transition.service";
import { ProgressTrackerService } from "../orchestrator/progress-tracker.service";

function toJsonRecord(value: unknown, context: string): Record<string, unknown> {
  const serialized = JSON.stringify(value);
  if (!serialized) {
    throw new Error(`${context} cannot be serialized`);
  }

  const parsed = JSON.parse(serialized) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${context} must serialize to an object`);
  }

  return parsed as Record<string, unknown>;
}

@Injectable()
export class PipelineService {
  private readonly logger = new Logger(PipelineService.name);
  private readonly typeByPhase: Record<
    PipelinePhase,
    | "ai_extraction"
    | "ai_scraping"
    | "ai_research"
    | "ai_evaluation"
    | "ai_synthesis"
  > = {
    [PipelinePhase.EXTRACTION]: "ai_extraction",
    [PipelinePhase.SCRAPING]: "ai_scraping",
    [PipelinePhase.RESEARCH]: "ai_research",
    [PipelinePhase.EVALUATION]: "ai_evaluation",
    [PipelinePhase.SYNTHESIS]: "ai_synthesis",
  };

  constructor(
    private drizzle: DrizzleService,
    private queue: QueueService,
    private pipelineState: PipelineStateService,
    private aiConfig: AiConfigService,
    private progressTracker: ProgressTrackerService,
    private phaseTransition: PhaseTransitionService,
    private errorRecovery: ErrorRecoveryService,
  ) {}

  async startPipeline(startupId: string, userId: string): Promise<string> {
    if (!this.aiConfig.isPipelineEnabled()) {
      throw new BadRequestException("AI pipeline is disabled");
    }

    const existing = await this.pipelineState.get(startupId);
    if (existing && existing.status === PipelineStatus.RUNNING) {
      throw new BadRequestException(
        `Pipeline already running for startup ${startupId}`,
      );
    }

    const state = await this.pipelineState.init(startupId, userId);
    await this.createPipelineRunRecord(state);
    await this.updateStartupStatus(startupId, StartupStatus.ANALYZING);
    await this.progressTracker.initProgress({
      startupId,
      userId,
      pipelineRunId: state.pipelineRunId,
      phases: this.phaseTransition.getConfig().phases.map((phase) => phase.phase),
    });

    for (const phase of this.phaseTransition.getInitialPhases()) {
      await this.queuePhase(startupId, state.pipelineRunId, userId, phase);
    }

    this.logger.log(
      `Started AI pipeline ${state.pipelineRunId} for startup ${startupId}`,
    );
    return state.pipelineRunId;
  }

  async getPipelineStatus(startupId: string): Promise<PipelineState | null> {
    return this.pipelineState.get(startupId);
  }

  async retryPhase(startupId: string, phase: PipelinePhase): Promise<void> {
    const state = await this.pipelineState.get(startupId);
    if (!state) {
      throw new Error(`Pipeline state for startup ${startupId} not found`);
    }

    if (state.phases[phase].status !== PhaseStatus.FAILED) {
      throw new BadRequestException(`Phase "${phase}" is not in failed state`);
    }

    await this.pipelineState.setStatus(startupId, PipelineStatus.RUNNING);
    await this.pipelineState.clearPhaseResult(startupId, phase);
    await this.pipelineState.resetRetryCount(startupId, phase);
    await this.pipelineState.updatePhase(startupId, phase, PhaseStatus.PENDING);
    await this.progressTracker.updatePhaseProgress({
      startupId,
      userId: state.userId,
      pipelineRunId: state.pipelineRunId,
      phase,
      status: PhaseStatus.PENDING,
    });

    await this.queuePhase(startupId, state.pipelineRunId, state.userId, phase);
  }

  async cancelPipeline(startupId: string): Promise<{ removedJobs: number }> {
    const state = await this.pipelineState.get(startupId);
    if (!state) {
      throw new Error(`Pipeline state for startup ${startupId} not found`);
    }

    const removedJobs = await this.queue.removePipelineJobs(startupId);
    this.errorRecovery.clearAllTimeoutsForStartup(startupId);
    await this.pipelineState.setStatus(startupId, PipelineStatus.CANCELLED);
    await this.updatePipelineRunStatus(state.pipelineRunId, PipelineStatus.CANCELLED);
    await this.progressTracker.setPipelineStatus({
      startupId,
      userId: state.userId,
      pipelineRunId: state.pipelineRunId,
      status: PipelineStatus.CANCELLED,
      currentPhase: state.currentPhase,
    });
    await this.updateStartupStatus(startupId, StartupStatus.SUBMITTED);

    return { removedJobs };
  }

  async onPhaseCompleted(
    startupId: string,
    phase: PipelinePhase,
  ): Promise<void> {
    const state = await this.pipelineState.get(startupId);
    if (!state) {
      return;
    }

    this.errorRecovery.clearPhaseTimeout(startupId, phase);
    await this.pipelineState.resetRetryCount(startupId, phase);
    await this.progressTracker.updatePhaseProgress({
      startupId,
      userId: state.userId,
      pipelineRunId: state.pipelineRunId,
      phase,
      status: PhaseStatus.COMPLETED,
    });

    if (phase === PipelinePhase.EVALUATION) {
      await this.updatePipelineQualityFromEvaluation(state.startupId);
    }

    await this.applyTransitions(startupId);
  }

  async onPhaseFailed(
    startupId: string,
    phase: PipelinePhase,
    error: string,
  ): Promise<void> {
    const state = await this.pipelineState.get(startupId);
    if (!state) {
      return;
    }

    this.errorRecovery.clearPhaseTimeout(startupId, phase);
    await this.progressTracker.updatePhaseProgress({
      startupId,
      userId: state.userId,
      pipelineRunId: state.pipelineRunId,
      phase,
      status: PhaseStatus.FAILED,
      error,
    });

    const phaseConfig = this.phaseTransition.getPhaseConfig(phase);
    const retryCount = await this.pipelineState.incrementRetryCount(
      startupId,
      phase,
    );

    await this.errorRecovery.recordFailure({
      pipelineRunId: state.pipelineRunId,
      startupId,
      phase,
      retryCount,
      error: {
        message: error,
      },
    });

    if (retryCount <= phaseConfig.maxRetries) {
      const delayMs = this.errorRecovery.getRetryDelayMs(
        this.phaseTransition.getConfig().defaultRetryPolicy,
        retryCount,
      );
      await this.queuePhase(
        startupId,
        state.pipelineRunId,
        state.userId,
        phase,
        delayMs,
        retryCount,
        error,
      );
      return;
    }

    await this.applyTransitions(startupId, error);
  }

  async onAgentProgress(params: {
    startupId: string;
    userId: string;
    pipelineRunId: string;
    phase: PipelinePhase;
    key: string;
    status: "pending" | "running" | "completed" | "failed";
    progress?: number;
    error?: string;
  }): Promise<void> {
    await this.progressTracker.updateAgentProgress(params);
  }

  private async queuePhase(
    startupId: string,
    pipelineRunId: string,
    userId: string,
    phase: PipelinePhase,
    delayMs = 0,
    retryCount = 0,
    waitingError?: string,
  ): Promise<void> {
    const phaseConfig = this.phaseTransition.getPhaseConfig(phase);
    await this.pipelineState.updatePhase(
      startupId,
      phase,
      PhaseStatus.WAITING,
      waitingError,
    );
    await this.progressTracker.updatePhaseProgress({
      startupId,
      userId,
      pipelineRunId,
      phase,
      status: PhaseStatus.WAITING,
      error: waitingError,
    });

    await this.queue.addJob(
      phaseConfig.queue,
      {
        type: this.typeByPhase[phase],
        startupId,
        pipelineRunId,
        userId,
        priority: 1,
        metadata: {
          retryCount,
        },
      },
      {
        delay: delayMs,
      },
    );

    this.errorRecovery.schedulePhaseTimeout({
      startupId,
      phase,
      timeoutMs: phaseConfig.timeoutMs + delayMs,
      onTimeout: () => {
        void this.handlePhaseTimeout(startupId, phase);
      },
    });
  }

  private async updateStartupStatus(
    startupId: string,
    status: StartupStatus,
  ): Promise<void> {
    await this.drizzle.db
      .update(startup)
      .set({ status })
      .where(eq(startup.id, startupId));
  }

  private async createPipelineRunRecord(state: PipelineState): Promise<void> {
    await this.drizzle.db.insert(pipelineRun).values({
      pipelineRunId: state.pipelineRunId,
      startupId: state.startupId,
      userId: state.userId,
      status: PipelineStatus.RUNNING,
      config: toJsonRecord(this.phaseTransition.getConfig(), "pipeline config"),
      startedAt: new Date(),
    });
  }

  private async updatePipelineRunStatus(
    pipelineRunId: string,
    status: PipelineStatus,
    error?: string,
  ): Promise<void> {
    await this.drizzle.db
      .update(pipelineRun)
      .set({
        status,
        completedAt:
          status === PipelineStatus.RUNNING ? null : new Date(),
        updatedAt: new Date(),
        error: error
          ? { message: error }
          : null,
      })
      .where(eq(pipelineRun.pipelineRunId, pipelineRunId));
  }

  private async updatePipelineQualityFromEvaluation(
    startupId: string,
  ): Promise<void> {
    const evaluation = await this.pipelineState.getPhaseResult(startupId, PipelinePhase.EVALUATION);

    const completed = evaluation?.summary?.completedAgents ?? 0;
    const minimum =
      evaluation?.summary?.minimumRequired ??
      this.phaseTransition.getConfig().minimumEvaluationAgents;
    const degraded = evaluation?.summary?.degraded ?? completed < minimum;

    if (degraded) {
      await this.pipelineState.setQuality(startupId, "degraded");
    }
  }

  private async applyTransitions(
    startupId: string,
    lastError?: string,
  ): Promise<void> {
    const refreshed = await this.pipelineState.get(startupId);
    if (!refreshed) {
      return;
    }

    const decision = this.phaseTransition.decideNextPhases(refreshed);
    if (decision.degraded) {
      await this.pipelineState.setQuality(startupId, "degraded");
    }

    for (const phase of decision.queue) {
      await this.queuePhase(
        startupId,
        refreshed.pipelineRunId,
        refreshed.userId,
        phase,
      );
    }

    if (!decision.pipelineComplete) {
      return;
    }

    if (decision.blockedByRequiredFailure) {
      await this.pipelineState.setStatus(startupId, PipelineStatus.FAILED);
      await this.updatePipelineRunStatus(
        refreshed.pipelineRunId,
        PipelineStatus.FAILED,
        lastError ?? "Critical phase failed",
      );
      await this.progressTracker.setPipelineStatus({
        startupId,
        userId: refreshed.userId,
        pipelineRunId: refreshed.pipelineRunId,
        status: PipelineStatus.FAILED,
        currentPhase: refreshed.currentPhase,
        error: lastError ?? "Critical phase failed",
      });
      await this.updateStartupStatus(startupId, StartupStatus.SUBMITTED);
      return;
    }

    await this.pipelineState.setStatus(startupId, PipelineStatus.COMPLETED);
    await this.updatePipelineRunStatus(
      refreshed.pipelineRunId,
      PipelineStatus.COMPLETED,
    );
    const synthesisResult = await this.pipelineState.getPhaseResult(startupId, PipelinePhase.SYNTHESIS);
    await this.progressTracker.setPipelineStatus({
      startupId,
      userId: refreshed.userId,
      pipelineRunId: refreshed.pipelineRunId,
      status: PipelineStatus.COMPLETED,
      currentPhase: PipelinePhase.SYNTHESIS,
      overallScore: synthesisResult?.overallScore,
    });
    await this.updateStartupStatus(startupId, StartupStatus.PENDING_REVIEW);
  }

  private async handlePhaseTimeout(
    startupId: string,
    phase: PipelinePhase,
  ): Promise<void> {
    const state = await this.pipelineState.get(startupId);
    if (!state) {
      return;
    }

    const status = state.phases[phase].status;
    if (status !== PhaseStatus.RUNNING && status !== PhaseStatus.WAITING) {
      return;
    }

    const message = `Phase "${phase}" timed out`;
    await this.pipelineState.updatePhase(startupId, phase, PhaseStatus.FAILED, message);
    await this.onPhaseFailed(startupId, phase, message);
  }
}
