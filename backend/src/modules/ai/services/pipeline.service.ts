import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { ModuleRef } from "@nestjs/core";
import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { DrizzleService } from "../../../database";
import { QueueService } from "../../../queue";
import { startup, StartupStatus } from "../../startup/entities";
import { pipelineRun } from "../entities";
import type {
  EvaluationAgentKey,
  ResearchAgentKey,
} from "../interfaces/agent.interface";
import { EVALUATION_AGENT_KEYS, RESEARCH_AGENT_KEYS } from "../constants/agent-keys";
import { AiConfigService } from "./ai-config.service";
import { PipelineFeedbackService } from "./pipeline-feedback.service";
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
import type { ClaraService } from "../../clara/clara.service";

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

type AgentRetryMetadata = {
  mode: "agent_retry";
  agentKey: string;
};

export interface RetryAgentRequest {
  phase: PipelinePhase.RESEARCH | PipelinePhase.EVALUATION;
  agentKey: ResearchAgentKey | EvaluationAgentKey;
}

interface QueuePhaseParams {
  startupId: string;
  pipelineRunId: string;
  userId: string;
  phase: PipelinePhase;
  delayMs?: number;
  retryCount?: number;
  waitingError?: string;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class PipelineService {
  private readonly logger = new Logger(PipelineService.name);
  private claraService: ClaraService | null = null;
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
    private pipelineFeedback: PipelineFeedbackService,
    private progressTracker: ProgressTrackerService,
    private phaseTransition: PhaseTransitionService,
    private errorRecovery: ErrorRecoveryService,
    private moduleRef: ModuleRef,
  ) {}

  private getClaraService(): ClaraService | null {
    if (this.claraService) return this.claraService;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { ClaraService: Cls } = require("../../clara/clara.service");
      this.claraService = this.moduleRef.get(Cls, { strict: false });
      return this.claraService;
    } catch {
      return null;
    }
  }

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
      await this.queuePhase({ startupId, pipelineRunId: state.pipelineRunId, userId, phase });
    }

    this.logger.log(
      `Started AI pipeline ${state.pipelineRunId} for startup ${startupId}`,
    );
    return state.pipelineRunId;
  }

  async getPipelineStatus(startupId: string): Promise<PipelineState | null> {
    return this.pipelineState.get(startupId);
  }

  async getTrackedProgress(startupId: string) {
    return this.progressTracker.getProgress(startupId);
  }

  async retryPhase(startupId: string, phase: PipelinePhase): Promise<void> {
    const state = await this.pipelineState.get(startupId);
    if (!state) {
      throw new Error(`Pipeline state for startup ${startupId} not found`);
    }

    if (state.phases[phase].status !== PhaseStatus.FAILED) {
      throw new BadRequestException(`Phase "${phase}" is not in failed state`);
    }

    const newRunId = await this.beginManualRun(state, phase);
    await this.queue.removePipelineJobs(startupId);
    await this.updateStartupStatus(startupId, StartupStatus.ANALYZING);
    await this.pipelineState.clearPhaseResult(startupId, phase);
    await this.pipelineState.resetRetryCount(startupId, phase);
    await this.pipelineState.resetPhase(startupId, phase);
    await this.progressTracker.updatePhaseProgress({
      startupId,
      userId: state.userId,
      pipelineRunId: newRunId,
      phase,
      status: PhaseStatus.PENDING,
    });

    await this.queuePhase({ startupId, pipelineRunId: newRunId, userId: state.userId, phase });
  }

  async rerunFromPhase(startupId: string, phase: PipelinePhase): Promise<void> {
    const state = await this.pipelineState.get(startupId);
    if (!state) {
      throw new Error(`Pipeline state for startup ${startupId} not found`);
    }

    const phasesToReset = this.getPhasesFrom(phase);
    if (!phasesToReset.length) {
      throw new BadRequestException(`Unknown phase "${phase}"`);
    }

    const newRunId = await this.beginManualRun(state, phase);
    await this.queue.removePipelineJobs(startupId);
    await this.updateStartupStatus(startupId, StartupStatus.ANALYZING);

    for (const phaseToReset of phasesToReset) {
      await this.resetPhaseForRerun({
        startupId,
        userId: state.userId,
        pipelineRunId: newRunId,
        phase: phaseToReset,
        clearResult: true,
      });
    }

    await this.queuePhase({ startupId, pipelineRunId: newRunId, userId: state.userId, phase });
  }

  async retryAgent(startupId: string, request: RetryAgentRequest): Promise<void> {
    const state = await this.pipelineState.get(startupId);
    if (!state) {
      throw new Error(`Pipeline state for startup ${startupId} not found`);
    }
    if (!this.isValidAgentForPhase(request.phase, request.agentKey)) {
      throw new BadRequestException(
        `Agent "${request.agentKey}" is not valid for phase "${request.phase}"`,
      );
    }
    const phaseStatus = state.phases[request.phase].status;
    if (phaseStatus !== PhaseStatus.FAILED && phaseStatus !== PhaseStatus.COMPLETED) {
      throw new BadRequestException(
        `Agent retry is only allowed when phase "${request.phase}" is failed or completed`,
      );
    }

    const metadata: AgentRetryMetadata = {
      mode: "agent_retry",
      agentKey: request.agentKey,
    };

    const newRunId = await this.beginManualRun(state, request.phase);
    await this.queue.removePipelineJobs(startupId);
    await this.updateStartupStatus(startupId, StartupStatus.ANALYZING);

    if (request.phase === PipelinePhase.RESEARCH) {
      await this.resetPhaseForRerun({
        startupId,
        userId: state.userId,
        pipelineRunId: newRunId,
        phase: PipelinePhase.RESEARCH,
        clearResult: false,
        preserveTelemetry: true,
      });
      await this.resetPhaseForRerun({
        startupId,
        userId: state.userId,
        pipelineRunId: newRunId,
        phase: PipelinePhase.EVALUATION,
        clearResult: true,
      });
      await this.resetPhaseForRerun({
        startupId,
        userId: state.userId,
        pipelineRunId: newRunId,
        phase: PipelinePhase.SYNTHESIS,
        clearResult: true,
      });

      await this.queuePhase({
        startupId,
        pipelineRunId: newRunId,
        userId: state.userId,
        phase: PipelinePhase.RESEARCH,
        metadata,
      });
      return;
    }

    await this.resetPhaseForRerun({
      startupId,
      userId: state.userId,
      pipelineRunId: newRunId,
      phase: PipelinePhase.EVALUATION,
      clearResult: false,
      preserveTelemetry: true,
    });
    await this.resetPhaseForRerun({
      startupId,
      userId: state.userId,
      pipelineRunId: newRunId,
      phase: PipelinePhase.SYNTHESIS,
      clearResult: true,
    });

    await this.queuePhase({
      startupId,
      pipelineRunId: newRunId,
      userId: state.userId,
      phase: PipelinePhase.EVALUATION,
      metadata,
    });
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
    await this.consumePhaseFeedbackSafely(startupId, phase);

    if (phase === PipelinePhase.EVALUATION) {
      await this.updatePipelineQualityFromEvaluation(state.startupId);
    }

    await this.applyTransitions(startupId);
  }

  async onPhaseStarted(
    startupId: string,
    phase: PipelinePhase,
  ): Promise<void> {
    const state = await this.pipelineState.get(startupId);
    if (!state) {
      return;
    }

    await this.progressTracker.updatePhaseProgress({
      startupId,
      userId: state.userId,
      pipelineRunId: state.pipelineRunId,
      phase,
      status: PhaseStatus.RUNNING,
    });
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
      await this.queuePhase({
        startupId,
        pipelineRunId: state.pipelineRunId,
        userId: state.userId,
        phase,
        delayMs,
        retryCount,
        waitingError: error,
      });
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
    attempt?: number;
    retryCount?: number;
    usedFallback?: boolean;
    lifecycleEvent?: "started" | "retrying" | "completed" | "failed" | "fallback";
  }): Promise<void> {
    await this.progressTracker.updateAgentProgress(params);
  }

  private async queuePhase(params: QueuePhaseParams): Promise<void> {
    const { startupId, pipelineRunId, userId, phase, delayMs = 0, retryCount = 0, waitingError, metadata } = params;
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
      retryCount,
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
          ...(metadata ?? {}),
        },
      },
      {
        delay: delayMs,
        attempts: 1,
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

    this.logger.debug(
      `[Pipeline] Phase transition decision | Startup: ${startupId} | NextPhases: ${decision.queue.join(", ") || "none"} | Degraded: ${decision.degraded} | Complete: ${decision.pipelineComplete}`,
    );
    this.logger.debug(
      `[Pipeline] Phase statuses: ${JSON.stringify(Object.fromEntries(Object.entries(refreshed.phases).map(([k, v]) => [k, v.status])))}`,
    );

    if (decision.degraded) {
      await this.pipelineState.setQuality(startupId, "degraded");
    }

    if (decision.queue.length > 0) {
      this.logger.log(
        `[Pipeline] Queueing ${decision.queue.length} next phase(s): ${decision.queue.join(", ")}`,
      );
    }

    for (const phase of decision.queue) {
      await this.queuePhase({
        startupId,
        pipelineRunId: refreshed.pipelineRunId,
        userId: refreshed.userId,
        phase,
      });
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

    // Notify Clara conversation if exists
    this.notifyClaraSafely(startupId, synthesisResult?.overallScore);
  }

  private notifyClaraSafely(
    startupId: string,
    overallScore?: number,
  ): void {
    const clara = this.getClaraService();
    if (!clara?.isEnabled()) return;
    clara.notifyPipelineComplete(startupId, overallScore).catch((err) => {
      this.logger.error(`Clara notification failed for ${startupId}: ${err}`);
    });
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

  private getPhasesFrom(phase: PipelinePhase): PipelinePhase[] {
    const orderedPhases = this.phaseTransition
      .getConfig()
      .phases.map((entry) => entry.phase);
    const index = orderedPhases.indexOf(phase);
    if (index < 0) {
      return [];
    }

    return orderedPhases.slice(index);
  }

  private async resetPhaseForRerun(params: {
    startupId: string;
    userId: string;
    pipelineRunId: string;
    phase: PipelinePhase;
    clearResult: boolean;
    preserveTelemetry?: boolean;
  }): Promise<void> {
    if (params.clearResult) {
      await this.pipelineState.clearPhaseResult(params.startupId, params.phase);
    }
    await this.pipelineState.resetRetryCount(params.startupId, params.phase);
    if (params.preserveTelemetry) {
      await this.pipelineState.resetPhaseStatus(params.startupId, params.phase);
    } else {
      await this.pipelineState.resetPhase(params.startupId, params.phase);
    }
    await this.progressTracker.updatePhaseProgress({
      startupId: params.startupId,
      userId: params.userId,
      pipelineRunId: params.pipelineRunId,
      phase: params.phase,
      status: PhaseStatus.PENDING,
    });
  }

  private isValidAgentForPhase(
    phase: PipelinePhase.RESEARCH | PipelinePhase.EVALUATION,
    agentKey: string,
  ): boolean {
    const keys: readonly string[] =
      phase === PipelinePhase.RESEARCH ? RESEARCH_AGENT_KEYS : EVALUATION_AGENT_KEYS;
    return keys.includes(agentKey);
  }

  private async consumePhaseFeedbackSafely(
    startupId: string,
    phase: PipelinePhase,
  ): Promise<void> {
    try {
      await this.pipelineFeedback.markConsumedByScope({
        startupId,
        phase,
        agentKey: null,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Failed to mark phase-level feedback consumed for ${phase}: ${message}`,
      );
    }
  }

  private async beginManualRun(
    state: PipelineState,
    currentPhase: PipelinePhase,
  ): Promise<string> {
    const nextRunId = randomUUID();

    if (state.status === PipelineStatus.RUNNING) {
      await this.updatePipelineRunStatus(
        state.pipelineRunId,
        PipelineStatus.CANCELLED,
        "Superseded by manual rerun",
      );
    }

    await this.pipelineState.setPipelineRunId(state.startupId, nextRunId);
    await this.pipelineState.setStatus(state.startupId, PipelineStatus.RUNNING);
    await this.createPipelineRunRecord({
      ...state,
      pipelineRunId: nextRunId,
      status: PipelineStatus.RUNNING,
      quality: "standard",
    });
    await this.progressTracker.initProgress({
      startupId: state.startupId,
      userId: state.userId,
      pipelineRunId: nextRunId,
      phases: this.phaseTransition.getConfig().phases.map((entry) => entry.phase),
    });
    await this.progressTracker.setPipelineStatus({
      startupId: state.startupId,
      userId: state.userId,
      pipelineRunId: nextRunId,
      status: PipelineStatus.RUNNING,
      currentPhase,
    });

    return nextRunId;
  }
}
