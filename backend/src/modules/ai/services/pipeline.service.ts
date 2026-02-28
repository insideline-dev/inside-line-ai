import { BadRequestException, Injectable, Logger, Optional } from "@nestjs/common";
import { ModuleRef } from "@nestjs/core";
import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { DrizzleService } from "../../../database";
import { StorageService } from "../../../storage";
import { NotificationType } from "../../../notification/entities";
import { NotificationService } from "../../../notification/notification.service";
import { QueueService } from "../../../queue";
import { startup, StartupStatus } from "../../startup/entities";
import { pipelineRun } from "../entities";
import type {
  EvaluationAgentKey,
  PipelineFallbackReason,
  ResearchAgentKey,
} from "../interfaces/agent.interface";
import { EVALUATION_AGENT_KEYS, RESEARCH_AGENT_KEYS } from "../constants/agent-keys";
import { AiConfigService } from "./ai-config.service";
import { PipelineFeedbackService } from "./pipeline-feedback.service";
import { PipelineAgentTraceService } from "./pipeline-agent-trace.service";
import { PipelineTemplateService } from "./pipeline-template.service";
import { PipelineStateService } from "./pipeline-state.service";
import { PipelineStateSnapshotService } from "./pipeline-state-snapshot.service";
import { StartupMatchingPipelineService } from "./startup-matching-pipeline.service";
import { EnrichmentService } from "./enrichment.service";
import {
  PhaseStatus,
  PipelinePhase,
  type PhaseResultMap,
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

const MIN_RESEARCH_PHASE_TIMEOUT_MS = 3_600_000;
const DEFAULT_RESEARCH_AGENT_STAGGER_MS = 5_000;
const RESEARCH_PHASE_1_MAX_STAGGER_OFFSETS = 3;

@Injectable()
export class PipelineService {
  private readonly logger = new Logger(PipelineService.name);
  private claraService: ClaraService | null = null;
  private readonly typeByPhase: Record<
    PipelinePhase,
    | "ai_extraction"
    | "ai_enrichment"
    | "ai_scraping"
    | "ai_research"
    | "ai_evaluation"
    | "ai_synthesis"
  > = {
    [PipelinePhase.EXTRACTION]: "ai_extraction",
    [PipelinePhase.ENRICHMENT]: "ai_enrichment",
    [PipelinePhase.SCRAPING]: "ai_scraping",
    [PipelinePhase.RESEARCH]: "ai_research",
    [PipelinePhase.EVALUATION]: "ai_evaluation",
    [PipelinePhase.SYNTHESIS]: "ai_synthesis",
  };

  constructor(
    private drizzle: DrizzleService,
    private queue: QueueService,
    private notifications: NotificationService,
    private pipelineState: PipelineStateService,
    private pipelineStateSnapshots: PipelineStateSnapshotService,
    private aiConfig: AiConfigService,
    private startupMatching: StartupMatchingPipelineService,
    private pipelineFeedback: PipelineFeedbackService,
    private progressTracker: ProgressTrackerService,
    private phaseTransition: PhaseTransitionService,
    private errorRecovery: ErrorRecoveryService,
    private pipelineTemplateService: PipelineTemplateService,
    private enrichmentService: EnrichmentService,
    private storage: StorageService,
    private moduleRef: ModuleRef,
    @Optional() private pipelineAgentTrace?: PipelineAgentTraceService,
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

    await this.assertPitchDeckStorageReady(startupId);

    const state = await this.pipelineState.init(startupId, userId);
    await this.pipelineAgentTrace?.cleanupExpired().catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Failed to clean up expired agent traces: ${message}`);
    });
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

    await this.notifyPipelineLifecycle({
      userId,
      startupId,
      type: NotificationType.INFO,
      title: "Analysis started",
      message: "AI pipeline analysis has started.",
    });

    this.logger.log(
      `Started AI pipeline ${state.pipelineRunId} for startup ${startupId}`,
    );
    return state.pipelineRunId;
  }

  private async assertPitchDeckStorageReady(startupId: string): Promise<void> {
    const [startupRecord] = await this.drizzle.db
      .select({
        pitchDeckPath: startup.pitchDeckPath,
      })
      .from(startup)
      .where(eq(startup.id, startupId))
      .limit(1);

    if (!startupRecord?.pitchDeckPath) {
      return;
    }

    try {
      const exists = await this.storage.exists(startupRecord.pitchDeckPath);
      if (exists) {
        return;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new BadRequestException(
        `Unable to verify pitch deck in storage for startup ${startupId}: ${message}`,
      );
    }

    throw new BadRequestException(
      `Pitch deck file is missing in storage for startup ${startupId}. Expected object key: ${startupRecord.pitchDeckPath}. Re-upload the file and retry the analysis.`,
    );
  }

  async getPipelineStatus(startupId: string): Promise<PipelineState | null> {
    return this.getPipelineStateWithSnapshotFallback(startupId);
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
    const rerunStartedAt = Date.now();
    const state = await this.getPipelineStateWithSnapshotFallback(startupId);
    if (!state) {
      throw new Error(`Pipeline state for startup ${startupId} not found`);
    }

    const phasesToReset = this.getPhasesFrom(phase);
    if (!phasesToReset.length) {
      throw new BadRequestException(`Unknown phase "${phase}"`);
    }

    let stepStartedAt = Date.now();
    const newRunId = await this.beginManualRun(state, phase);
    this.logger.debug(
      `[Pipeline] Manual rerun setup | Step: beginManualRun | Startup: ${startupId} | Phase: ${phase} | Run: ${newRunId} | Duration: ${Date.now() - stepStartedAt}ms`,
    );

    stepStartedAt = Date.now();
    const removedJobs = await this.queue.removePipelineJobs(startupId);
    this.logger.debug(
      `[Pipeline] Manual rerun setup | Step: removePipelineJobs | Startup: ${startupId} | Phase: ${phase} | Run: ${newRunId} | Removed: ${removedJobs} | Duration: ${Date.now() - stepStartedAt}ms`,
    );

    stepStartedAt = Date.now();
    await this.updateStartupStatus(startupId, StartupStatus.ANALYZING);
    this.logger.debug(
      `[Pipeline] Manual rerun setup | Step: updateStartupStatus | Startup: ${startupId} | Phase: ${phase} | Run: ${newRunId} | Duration: ${Date.now() - stepStartedAt}ms`,
    );

    stepStartedAt = Date.now();
    for (const phaseToReset of phasesToReset) {
      await this.resetPhaseForRerun({
        startupId,
        userId: state.userId,
        pipelineRunId: newRunId,
        phase: phaseToReset,
        clearResult: true,
        skipProgressUpdate: true,
      });
    }
    this.logger.debug(
      `[Pipeline] Manual rerun setup | Step: resetPhaseStateForRerun | Startup: ${startupId} | Phase: ${phase} | Run: ${newRunId} | Phases: ${phasesToReset.join(", ")} | Duration: ${Date.now() - stepStartedAt}ms`,
    );

    stepStartedAt = Date.now();
    await this.progressTracker.resetPhasesForRerun({
      startupId,
      userId: state.userId,
      pipelineRunId: newRunId,
      phases: phasesToReset,
    });
    this.logger.debug(
      `[Pipeline] Manual rerun setup | Step: resetProgressForRerun(batch) | Startup: ${startupId} | Phase: ${phase} | Run: ${newRunId} | Phases: ${phasesToReset.join(", ")} | Duration: ${Date.now() - stepStartedAt}ms`,
    );

    stepStartedAt = Date.now();
    await this.queuePhase({ startupId, pipelineRunId: newRunId, userId: state.userId, phase });
    this.logger.debug(
      `[Pipeline] Manual rerun setup | Step: queuePhase | Startup: ${startupId} | Phase: ${phase} | Run: ${newRunId} | Duration: ${Date.now() - stepStartedAt}ms`,
    );
    this.logger.log(
      `[Pipeline] Manual rerun prepared | Startup: ${startupId} | Phase: ${phase} | Run: ${newRunId} | Total setup duration: ${Date.now() - rerunStartedAt}ms`,
    );
  }

  async retryAgent(startupId: string, request: RetryAgentRequest): Promise<void> {
    const state = await this.getPipelineStateWithSnapshotFallback(startupId);
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
    const alreadyCancelled = state.status === PipelineStatus.CANCELLED;

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
    if (!alreadyCancelled) {
      await this.notifyPipelineLifecycle({
        userId: state.userId,
        startupId,
        type: NotificationType.WARNING,
        title: "Analysis cancelled",
        message: "AI pipeline analysis was cancelled.",
      });
    }

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
    try {
      await this.progressTracker.updatePhaseProgress({
        startupId,
        userId: state.userId,
        pipelineRunId: state.pipelineRunId,
        phase,
        status: PhaseStatus.COMPLETED,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `[Pipeline] Failed to persist completed progress for ${phase}; continuing transitions | Startup: ${startupId} | Run: ${state.pipelineRunId} | Error: ${message}`,
      );
    }
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
      await this.pipelineState.resetPhase(startupId, phase);
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
    agentAttemptId?: string;
    phaseRetryCount?: number;
    usedFallback?: boolean;
    fallbackReason?: PipelineFallbackReason;
    rawProviderError?: string;
    lifecycleEvent?: "started" | "retrying" | "completed" | "failed" | "fallback";
    dataSummary?: Record<string, unknown>;
  }): Promise<void> {
    await this.progressTracker.updateAgentProgress(params);
  }

  async onPhaseSkipped<P extends PipelinePhase>(params: {
    startupId: string;
    pipelineRunId: string;
    userId: string;
    phase: P;
    reason: string;
    result?: PhaseResultMap[P];
    retryCount?: number;
  }): Promise<boolean> {
    const {
      startupId,
      pipelineRunId,
      userId,
      phase,
      reason,
      result,
      retryCount = 0,
    } = params;
    const state = await this.pipelineState.get(startupId);
    if (!state) {
      return false;
    }
    if (
      state.pipelineRunId !== pipelineRunId ||
      state.status !== PipelineStatus.RUNNING
    ) {
      return false;
    }

    const phaseStatus = state.phases[phase]?.status;
    if (
      phaseStatus === PhaseStatus.COMPLETED ||
      phaseStatus === PhaseStatus.FAILED
    ) {
      return false;
    }

    this.errorRecovery.clearPhaseTimeout(startupId, phase);
    if (result !== undefined) {
      await this.pipelineState.setPhaseResult(startupId, phase, result);
    }
    await this.pipelineState.updatePhase(startupId, phase, PhaseStatus.SKIPPED);
    await this.pipelineState.resetRetryCount(startupId, phase);
    await this.progressTracker.updatePhaseProgress({
      startupId,
      userId,
      pipelineRunId,
      phase,
      status: PhaseStatus.SKIPPED,
      retryCount,
    });
    await this.consumePhaseFeedbackSafely(startupId, phase);
    this.logger.log(
      `[Pipeline] Skipping ${phase} phase for ${startupId}: ${reason}`,
    );
    await this.applyTransitions(startupId);
    return true;
  }

  private async queuePhase(params: QueuePhaseParams): Promise<void> {
    const { startupId, pipelineRunId, userId, phase, delayMs = 0, retryCount = 0, waitingError, metadata } = params;
    const latestState = await this.pipelineState.get(startupId);
    if (!latestState) {
      this.logger.debug(
        `[Pipeline] Skipping queue for ${phase}; pipeline state missing for startup ${startupId}`,
      );
      return;
    }
    if (latestState.pipelineRunId !== pipelineRunId) {
      this.logger.debug(
        `[Pipeline] Skipping queue for ${phase}; stale run ${pipelineRunId} (current: ${latestState.pipelineRunId}) for startup ${startupId}`,
      );
      return;
    }
    if (latestState.status !== PipelineStatus.RUNNING) {
      this.logger.debug(
        `[Pipeline] Skipping queue for ${phase}; pipeline status is ${latestState.status} for startup ${startupId}`,
      );
      return;
    }
    if (latestState.phases[phase]?.status !== PhaseStatus.PENDING) {
      this.logger.debug(
        `[Pipeline] Skipping queue for ${phase}; phase status is ${latestState.phases[phase]?.status ?? "missing"} for startup ${startupId}`,
      );
      return;
    }

    if (phase === PipelinePhase.ENRICHMENT) {
      if (!this.aiConfig.isEnrichmentEnabled()) {
        const skippedResult = this.enrichmentService.buildSkippedResult(
          "Enrichment temporarily disabled by configuration",
        );
        await this.onPhaseSkipped({
          startupId,
          pipelineRunId,
          userId,
          phase,
          reason: "Enrichment temporarily disabled by configuration",
          result: skippedResult,
          retryCount,
        });
        return;
      }

      const enrichmentNeed = await this.enrichmentService.assessNeed(startupId);
      if (!enrichmentNeed.shouldRun) {
        const skippedResult = this.enrichmentService.buildSkippedResult(
          enrichmentNeed.reason,
        );
        await this.onPhaseSkipped({
          startupId,
          pipelineRunId,
          userId,
          phase,
          reason: enrichmentNeed.reason,
          result: skippedResult,
          retryCount,
        });
        return;
      }
    }

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
      timeoutMs: this.resolvePhaseTimeoutMs(phase, phaseConfig.timeoutMs) + delayMs,
      onTimeout: () => {
        void this.handlePhaseTimeout(startupId, phase);
      },
    });
  }

  private resolvePhaseTimeoutMs(
    phase: PipelinePhase,
    configuredTimeoutMs: number,
  ): number {
    const normalizedConfiguredTimeout = Number.isFinite(configuredTimeoutMs)
      ? Math.max(1, Math.floor(configuredTimeoutMs))
      : 1;
    if (phase !== PipelinePhase.RESEARCH) {
      return normalizedConfiguredTimeout;
    }

    const config = this.aiConfig as Partial<AiConfigService>;
    const researchHardTimeoutMs =
      typeof config.getResearchAgentHardTimeoutMs === "function"
        ? config.getResearchAgentHardTimeoutMs()
        : MIN_RESEARCH_PHASE_TIMEOUT_MS;
    const researchStaggerMs =
      typeof config.getResearchAgentStaggerMs === "function"
        ? config.getResearchAgentStaggerMs()
        : DEFAULT_RESEARCH_AGENT_STAGGER_MS;

    // Research runs in two waves: phase 1 staggered agents, then competitor agent.
    // Budget phase timeout to accommodate worst-case deep-research duration.
    const phase1MaxStartDelayMs =
      Math.max(0, researchStaggerMs) * RESEARCH_PHASE_1_MAX_STAGGER_OFFSETS;
    const deepResearchBudgetMs = researchHardTimeoutMs * 2 + phase1MaxStartDelayMs;

    return Math.max(
      normalizedConfiguredTimeout,
      MIN_RESEARCH_PHASE_TIMEOUT_MS,
      researchHardTimeoutMs,
      deepResearchBudgetMs,
    );
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

  private async getStartupStatus(startupId: string): Promise<StartupStatus | null> {
    const [record] = await this.drizzle.db
      .select({ status: startup.status })
      .from(startup)
      .where(eq(startup.id, startupId))
      .limit(1);

    return (record?.status as StartupStatus | undefined) ?? null;
  }

  private async finalizeStartupAfterPipelineCompletion(
    startupId: string,
    requestedBy: string,
  ): Promise<void> {
    const currentStatus = await this.getStartupStatus(startupId);

    if (currentStatus === StartupStatus.APPROVED) {
      try {
        await this.startupMatching.queueStartupMatching({
          startupId,
          requestedBy,
          triggerSource: "pipeline_completion",
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(
          `Pipeline completed but deferred matching queue failed for startup ${startupId}: ${message}`,
        );
      }
      return;
    }

    if (currentStatus === StartupStatus.REJECTED) {
      return;
    }

    await this.updateStartupStatus(startupId, StartupStatus.PENDING_REVIEW);
  }

  private async createPipelineRunRecord(state: PipelineState): Promise<void> {
    const runtimeSnapshot = await this.pipelineTemplateService.getRuntimeSnapshot(
      "pipeline",
    );

    await this.drizzle.db.insert(pipelineRun).values({
      pipelineRunId: state.pipelineRunId,
      startupId: state.startupId,
      userId: state.userId,
      status: PipelineStatus.RUNNING,
      config: toJsonRecord(
        {
          phaseConfig: this.phaseTransition.getConfig(),
          runtimeSnapshot,
        },
        "pipeline config",
      ),
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

  private async getPipelineStateWithSnapshotFallback(
    startupId: string,
  ): Promise<PipelineState | null> {
    const liveState = await this.pipelineState.get(startupId);
    if (liveState) {
      return liveState;
    }

    const snapshot = await this.pipelineStateSnapshots.getLatestReusableSnapshot(
      startupId,
    );
    if (!snapshot) {
      return null;
    }

    try {
      const restored = await this.pipelineState.restoreFromSnapshot(
        snapshot,
        startupId,
      );
      this.logger.log(
        `[Pipeline] Restored reusable pipeline state from DB snapshot for startup ${startupId} (run ${restored.pipelineRunId})`,
      );
      return restored;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `[Pipeline] Failed to restore pipeline state snapshot for startup ${startupId}: ${message}`,
      );
      return null;
    }
  }

  private async persistCompletedPipelineStateSnapshotSafely(
    startupId: string,
    expectedPipelineRunId: string,
  ): Promise<void> {
    try {
      const state = await this.pipelineState.get(startupId);
      if (!state) {
        this.logger.warn(
          `[Pipeline] Skipping DB snapshot persistence; pipeline state missing for startup ${startupId} after completion`,
        );
        return;
      }
      if (state.pipelineRunId !== expectedPipelineRunId) {
        this.logger.warn(
          `[Pipeline] Skipping DB snapshot persistence; current run ${state.pipelineRunId} does not match completed run ${expectedPipelineRunId} for startup ${startupId}`,
        );
        return;
      }
      if (state.status !== PipelineStatus.COMPLETED) {
        this.logger.warn(
          `[Pipeline] Skipping DB snapshot persistence; state status is ${state.status} (expected completed) for startup ${startupId}, run ${expectedPipelineRunId}`,
        );
        return;
      }

      await this.pipelineStateSnapshots.saveCompletedSnapshot(state);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `[Pipeline] Failed to persist reusable pipeline state snapshot for startup ${startupId}, run ${expectedPipelineRunId}: ${message}`,
      );
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
    const shouldNotifyTerminal =
      refreshed.status !== PipelineStatus.COMPLETED &&
      refreshed.status !== PipelineStatus.CANCELLED &&
      refreshed.status !== PipelineStatus.FAILED;

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
      await this.pipelineState.setQuality(startupId, "degraded");
      const degradedReason = lastError ?? "Critical phase failed, completed with degraded output";
      await this.updatePipelineRunStatus(
        refreshed.pipelineRunId,
        PipelineStatus.COMPLETED,
        degradedReason,
      );
      await this.pipelineState.setStatus(startupId, PipelineStatus.COMPLETED);
      await this.progressTracker.setPipelineStatus({
        startupId,
        userId: refreshed.userId,
        pipelineRunId: refreshed.pipelineRunId,
        status: PipelineStatus.COMPLETED,
        currentPhase: refreshed.currentPhase,
        error: degradedReason,
      });
      await this.persistCompletedPipelineStateSnapshotSafely(
        startupId,
        refreshed.pipelineRunId,
      );
      await this.finalizeStartupAfterPipelineCompletion(startupId, refreshed.userId);
      if (shouldNotifyTerminal) {
        await this.notifyPipelineLifecycle({
          userId: refreshed.userId,
          startupId,
          type: NotificationType.WARNING,
          title: "Analysis completed with warnings",
          message: degradedReason,
        });
      }
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
    await this.persistCompletedPipelineStateSnapshotSafely(
      startupId,
      refreshed.pipelineRunId,
    );
    await this.finalizeStartupAfterPipelineCompletion(startupId, refreshed.userId);
    if (shouldNotifyTerminal) {
      await this.notifyPipelineLifecycle({
        userId: refreshed.userId,
        startupId,
        type: NotificationType.SUCCESS,
        title: "Analysis completed",
        message: "AI pipeline analysis completed successfully.",
      });
    }

    // Notify Clara conversation if exists
    this.notifyClaraSafely(startupId, synthesisResult?.overallScore);
  }

  private async notifyPipelineLifecycle(params: {
    userId: string;
    startupId: string;
    type: NotificationType;
    title: string;
    message: string;
  }): Promise<void> {
    const startupLabel = await this.getStartupLabel(params.startupId);
    try {
      await this.notifications.createAndBroadcast(
        params.userId,
        `${params.title}: ${startupLabel}`,
        params.message,
        params.type,
        `/admin/startup/${params.startupId}`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Failed to send lifecycle notification for startup ${params.startupId}: ${message}`,
      );
    }
  }

  private async getStartupLabel(startupId: string): Promise<string> {
    try {
      const [record] = await this.drizzle.db
        .select({ name: startup.name })
        .from(startup)
        .where(eq(startup.id, startupId))
        .limit(1);
      if (record?.name) {
        return record.name;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.debug(
        `Unable to fetch startup name for notification on ${startupId}: ${message}`,
      );
    }

    return `Startup ${startupId}`;
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
    skipProgressUpdate?: boolean;
  }): Promise<void> {
    const startedAt = Date.now();
    if (params.clearResult) {
      await this.pipelineState.clearPhaseResult(params.startupId, params.phase);
    }
    await this.pipelineState.resetRetryCount(params.startupId, params.phase);
    if (params.preserveTelemetry) {
      await this.pipelineState.resetPhaseStatus(params.startupId, params.phase);
    } else {
      await this.pipelineState.resetPhase(params.startupId, params.phase);
    }
    if (!params.skipProgressUpdate) {
      await this.progressTracker.updatePhaseProgress({
        startupId: params.startupId,
        userId: params.userId,
        pipelineRunId: params.pipelineRunId,
        phase: params.phase,
        status: PhaseStatus.PENDING,
      });
    }
    this.logger.debug(
      `[Pipeline] resetPhaseForRerun | Startup: ${params.startupId} | Run: ${params.pipelineRunId} | Phase: ${params.phase} | ClearResult: ${params.clearResult} | PreserveTelemetry: ${Boolean(params.preserveTelemetry)} | SkipProgressUpdate: ${Boolean(params.skipProgressUpdate)} | Duration: ${Date.now() - startedAt}ms`,
    );
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
    const startedAt = Date.now();
    const nextRunId = randomUUID();
    const initialPhaseStatuses = Object.fromEntries(
      Object.entries(state.phases).map(([phase, value]) => [
        phase,
        value.status,
      ]),
    ) as Partial<Record<PipelinePhase, PhaseStatus>>;

    if (state.status === PipelineStatus.RUNNING) {
      const cancelPrevStartedAt = Date.now();
      await this.updatePipelineRunStatus(
        state.pipelineRunId,
        PipelineStatus.CANCELLED,
        "Superseded by manual rerun",
      );
      this.logger.debug(
        `[Pipeline] beginManualRun | Step: cancelPreviousRunRecord | Startup: ${state.startupId} | PrevRun: ${state.pipelineRunId} | NextRun: ${nextRunId} | Duration: ${Date.now() - cancelPrevStartedAt}ms`,
      );
    }

    let stepStartedAt = Date.now();
    await this.pipelineState.setPipelineRunId(state.startupId, nextRunId);
    this.logger.debug(
      `[Pipeline] beginManualRun | Step: setPipelineRunId | Startup: ${state.startupId} | NextRun: ${nextRunId} | Duration: ${Date.now() - stepStartedAt}ms`,
    );
    stepStartedAt = Date.now();
    await this.pipelineState.setStatus(state.startupId, PipelineStatus.RUNNING);
    this.logger.debug(
      `[Pipeline] beginManualRun | Step: setPipelineStatus(state) | Startup: ${state.startupId} | NextRun: ${nextRunId} | Duration: ${Date.now() - stepStartedAt}ms`,
    );
    stepStartedAt = Date.now();
    await this.createPipelineRunRecord({
      ...state,
      pipelineRunId: nextRunId,
      status: PipelineStatus.RUNNING,
      quality: "standard",
    });
    this.logger.debug(
      `[Pipeline] beginManualRun | Step: createPipelineRunRecord | Startup: ${state.startupId} | NextRun: ${nextRunId} | Duration: ${Date.now() - stepStartedAt}ms`,
    );
    stepStartedAt = Date.now();
    await this.progressTracker.initProgress({
      startupId: state.startupId,
      userId: state.userId,
      pipelineRunId: nextRunId,
      phases: this.phaseTransition.getConfig().phases.map((entry) => entry.phase),
      initialPhaseStatuses,
      currentPhase,
    });
    this.logger.debug(
      `[Pipeline] beginManualRun | Step: initProgress | Startup: ${state.startupId} | NextRun: ${nextRunId} | CurrentPhase: ${currentPhase} | Duration: ${Date.now() - stepStartedAt}ms`,
    );
    this.logger.debug(
      `[Pipeline] beginManualRun | Total | Startup: ${state.startupId} | NextRun: ${nextRunId} | CurrentPhase: ${currentPhase} | Duration: ${Date.now() - startedAt}ms`,
    );

    return nextRunId;
  }
}
