import { beforeEach, describe, expect, it, jest } from "bun:test";
import { BadRequestException } from "@nestjs/common";
import { DrizzleService } from "../../../../database";
import { QueueService } from "../../../../queue";
import { AiConfigService } from "../../services/ai-config.service";
import { PipelineStateService } from "../../services/pipeline-state.service";
import { PipelineStateSnapshotService } from "../../services/pipeline-state-snapshot.service";
import { PipelineService } from "../../services/pipeline.service";
import {
  PhaseStatus,
  PipelinePhase,
  PipelineStatus,
  type PipelineState,
} from "../../interfaces/pipeline.interface";
import { ProgressTrackerService } from "../../orchestrator/progress-tracker.service";
import { PhaseTransitionService } from "../../orchestrator/phase-transition.service";
import { ErrorRecoveryService } from "../../orchestrator/error-recovery.service";
import { PipelineFeedbackService } from "../../services/pipeline-feedback.service";
import { StartupMatchingPipelineService } from "../../services/startup-matching-pipeline.service";
import { PipelineTemplateService } from "../../services/pipeline-template.service";
import { EnrichmentService } from "../../services/enrichment.service";
import { ModuleRef } from "@nestjs/core";
import { NotificationService } from "../../../../notification/notification.service";
import { StorageService } from "../../../../storage";

function createState(
  overrides: Partial<PipelineState> = {},
  phaseOverrides: Partial<Record<PipelinePhase, PhaseStatus>> = {},
): PipelineState {
  return {
    pipelineRunId: "run-1",
    startupId: "startup-1",
    userId: "user-1",
    status: PipelineStatus.RUNNING,
    quality: "standard",
    currentPhase: PipelinePhase.EXTRACTION,
    phases: {
      [PipelinePhase.ENRICHMENT]: {
        status: phaseOverrides[PipelinePhase.ENRICHMENT] ?? PhaseStatus.PENDING,
      },
      [PipelinePhase.EXTRACTION]: {
        status: phaseOverrides[PipelinePhase.EXTRACTION] ?? PhaseStatus.PENDING,
      },
      [PipelinePhase.SCRAPING]: {
        status: phaseOverrides[PipelinePhase.SCRAPING] ?? PhaseStatus.PENDING,
      },
      [PipelinePhase.RESEARCH]: {
        status: phaseOverrides[PipelinePhase.RESEARCH] ?? PhaseStatus.PENDING,
      },
      [PipelinePhase.EVALUATION]: {
        status: phaseOverrides[PipelinePhase.EVALUATION] ?? PhaseStatus.PENDING,
      },
      [PipelinePhase.SYNTHESIS]: {
        status: phaseOverrides[PipelinePhase.SYNTHESIS] ?? PhaseStatus.PENDING,
      },
    },
    results: {},
    retryCounts: {},
    telemetry: {
      startedAt: new Date().toISOString(),
      totalTokens: { input: 0, output: 0 },
      phases: {
        [PipelinePhase.ENRICHMENT]: {
          phase: PipelinePhase.ENRICHMENT,
          agentCount: 0,
          successCount: 0,
          failedCount: 0,
        },
        [PipelinePhase.EXTRACTION]: {
          phase: PipelinePhase.EXTRACTION,
          agentCount: 0,
          successCount: 0,
          failedCount: 0,
        },
        [PipelinePhase.SCRAPING]: {
          phase: PipelinePhase.SCRAPING,
          agentCount: 0,
          successCount: 0,
          failedCount: 0,
        },
        [PipelinePhase.RESEARCH]: {
          phase: PipelinePhase.RESEARCH,
          agentCount: 0,
          successCount: 0,
          failedCount: 0,
        },
        [PipelinePhase.EVALUATION]: {
          phase: PipelinePhase.EVALUATION,
          agentCount: 0,
          successCount: 0,
          failedCount: 0,
        },
        [PipelinePhase.SYNTHESIS]: {
          phase: PipelinePhase.SYNTHESIS,
          agentCount: 0,
          successCount: 0,
          failedCount: 0,
        },
      },
      agents: {},
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("PipelineService", () => {
  let service: PipelineService;
  let drizzle: jest.Mocked<DrizzleService>;
  let queue: jest.Mocked<QueueService>;
  let stateService: jest.Mocked<PipelineStateService>;
  let pipelineStateSnapshots: jest.Mocked<PipelineStateSnapshotService>;
  let aiConfig: jest.Mocked<AiConfigService>;
  let progressTracker: jest.Mocked<ProgressTrackerService>;
  let phaseTransition: jest.Mocked<PhaseTransitionService>;
  let errorRecovery: jest.Mocked<ErrorRecoveryService>;
  let pipelineFeedback: jest.Mocked<PipelineFeedbackService>;
  let startupMatching: jest.Mocked<StartupMatchingPipelineService>;
  let pipelineTemplateService: jest.Mocked<PipelineTemplateService>;
  let enrichmentService: jest.Mocked<EnrichmentService>;
  let moduleRef: jest.Mocked<ModuleRef>;
  let notifications: jest.Mocked<NotificationService>;
  let storage: jest.Mocked<StorageService>;

  const mockDb = {
    mode: "none" as "none" | "select" | "update" | "insert",
    select: jest.fn(function (this: { mode: string }) {
      this.mode = "select";
      return this;
    }),
    from: jest.fn().mockReturnThis(),
    limit: jest.fn().mockImplementation(function (this: { mode: string }) {
      if (this.mode === "select") {
        return Promise.resolve([{ status: "analyzing", name: "Test Startup" }]);
      }
      return Promise.resolve(undefined);
    }),
    update: jest.fn(function (this: { mode: string }) {
      this.mode = "update";
      return this;
    }),
    set: jest.fn().mockReturnThis(),
    where: jest.fn().mockImplementation(function (this: { mode: string }) {
      if (this.mode === "select") {
        return this;
      }
      return Promise.resolve(undefined);
    }),
    insert: jest.fn(function (this: { mode: string }) {
      this.mode = "insert";
      return this;
    }),
    values: jest.fn().mockResolvedValue(undefined),
  };

  const phaseConfig = {
    [PipelinePhase.EXTRACTION]: {
      phase: PipelinePhase.EXTRACTION,
      queue: "ai-extraction",
      timeoutMs: 1000,
      maxRetries: 2,
      dependsOn: [],
      canRunParallelWith: [PipelinePhase.SCRAPING],
      required: false,
    },
    [PipelinePhase.SCRAPING]: {
      phase: PipelinePhase.SCRAPING,
      queue: "ai-scraping",
      timeoutMs: 1000,
      maxRetries: 2,
      dependsOn: [],
      canRunParallelWith: [PipelinePhase.EXTRACTION],
      required: false,
    },
    [PipelinePhase.RESEARCH]: {
      phase: PipelinePhase.RESEARCH,
      queue: "ai-research",
      timeoutMs: 1000,
      maxRetries: 2,
      dependsOn: [PipelinePhase.EXTRACTION, PipelinePhase.SCRAPING],
      canRunParallelWith: [],
      required: false,
    },
    [PipelinePhase.EVALUATION]: {
      phase: PipelinePhase.EVALUATION,
      queue: "ai-evaluation",
      timeoutMs: 1000,
      maxRetries: 2,
      dependsOn: [PipelinePhase.RESEARCH],
      canRunParallelWith: [],
      required: true,
    },
    [PipelinePhase.SYNTHESIS]: {
      phase: PipelinePhase.SYNTHESIS,
      queue: "ai-synthesis",
      timeoutMs: 1000,
      maxRetries: 2,
      dependsOn: [PipelinePhase.EVALUATION],
      canRunParallelWith: [],
      required: true,
    },
  };

  beforeEach(() => {
    drizzle = { db: mockDb as any } as jest.Mocked<DrizzleService>;
    queue = {
      addJob: jest.fn().mockResolvedValue("job-1"),
      removePipelineJobs: jest.fn().mockResolvedValue(0),
    } as unknown as jest.Mocked<QueueService>;

    let _trackedState: PipelineState = createState();
    stateService = {
      get: jest.fn().mockImplementation(() => Promise.resolve({ ..._trackedState, phases: { ..._trackedState.phases } })),
      init: jest.fn().mockResolvedValue(createState()),
      updatePhase: jest.fn().mockImplementation((_startupId: string, phase: PipelinePhase, status: PhaseStatus) => {
        _trackedState = {
          ..._trackedState,
          phases: {
            ..._trackedState.phases,
            [phase]: { ..._trackedState.phases[phase as PipelinePhase], status },
          },
        };
        return Promise.resolve(undefined);
      }),
      setStatus: jest.fn().mockImplementation((_startupId: string, status: PipelineStatus) => {
        _trackedState = { ..._trackedState, status };
        return Promise.resolve(undefined);
      }),
      setPhaseResult: jest.fn().mockResolvedValue(undefined),
      clearPhaseResult: jest.fn().mockResolvedValue(undefined),
      resetRetryCount: jest.fn().mockResolvedValue(undefined),
      resetPhase: jest.fn().mockImplementation((_startupId: string, phase: PipelinePhase) => {
        _trackedState = {
          ..._trackedState,
          phases: {
            ..._trackedState.phases,
            [phase]: { ..._trackedState.phases[phase as PipelinePhase], status: PhaseStatus.PENDING },
          },
        };
        return Promise.resolve(undefined);
      }),
      resetPhaseStatus: jest.fn().mockResolvedValue(undefined),
      setPipelineRunId: jest.fn().mockImplementation((_startupId: string, runId: string) => {
        _trackedState = { ..._trackedState, pipelineRunId: runId };
        return Promise.resolve(undefined);
      }),
      incrementRetryCount: jest.fn().mockResolvedValue(1),
      setQuality: jest.fn().mockResolvedValue(undefined),
      getPhaseResult: jest.fn().mockResolvedValue(null),
    } as unknown as jest.Mocked<PipelineStateService>;

    aiConfig = {
      isPipelineEnabled: jest.fn().mockReturnValue(true),
      isEnrichmentEnabled: jest.fn().mockReturnValue(true),
    } as unknown as jest.Mocked<AiConfigService>;

    pipelineStateSnapshots = {
      getLatestReusableSnapshot: jest.fn().mockResolvedValue(null),
      saveCompletedSnapshot: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<PipelineStateSnapshotService>;

    progressTracker = {
      initProgress: jest.fn().mockResolvedValue(undefined),
      updatePhaseProgress: jest.fn().mockResolvedValue(undefined),
      setPipelineStatus: jest.fn().mockResolvedValue(undefined),
      updateAgentProgress: jest.fn().mockResolvedValue(undefined),
      resetPhasesForRerun: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<ProgressTrackerService>;

    phaseTransition = {
      getConfig: jest.fn().mockReturnValue({
        phases: Object.values(phaseConfig),
        defaultRetryPolicy: {
          maxRetries: 3,
          backoff: "exponential",
          initialDelayMs: 1000,
        },
        maxPipelineTimeoutMs: 600000,
        minimumEvaluationAgents: 8,
      }),
      getInitialPhases: jest.fn().mockReturnValue([
        PipelinePhase.EXTRACTION,
        PipelinePhase.SCRAPING,
      ]),
      getPhaseConfig: jest.fn((phase: PipelinePhase) => phaseConfig[phase]),
      decideNextPhases: jest.fn().mockReturnValue({
        queue: [],
        blockedByRequiredFailure: false,
        pipelineComplete: false,
        degraded: false,
      }),
    } as unknown as jest.Mocked<PhaseTransitionService>;

    errorRecovery = {
      clearPhaseTimeout: jest.fn(),
      clearAllTimeoutsForStartup: jest.fn(),
      schedulePhaseTimeout: jest.fn(),
      recordFailure: jest.fn().mockResolvedValue(undefined),
      getRetryDelayMs: jest.fn().mockReturnValue(1000),
    } as unknown as jest.Mocked<ErrorRecoveryService>;

    pipelineFeedback = {
      markConsumedByScope: jest.fn().mockResolvedValue(0),
    } as unknown as jest.Mocked<PipelineFeedbackService>;

    startupMatching = {
      queueStartupMatching: jest.fn().mockResolvedValue({
        startupId: "startup-1",
        analysisJobId: "analysis-job-1",
        queueJobId: "queue-job-1",
        status: "queued",
        triggerSource: "retry",
      }),
    } as unknown as jest.Mocked<StartupMatchingPipelineService>;

    pipelineTemplateService = {
      getRuntimeSnapshot: jest.fn().mockResolvedValue(null),
    } as unknown as jest.Mocked<PipelineTemplateService>;

    enrichmentService = {
      assessNeed: jest.fn().mockResolvedValue({
        shouldRun: true,
        missing: [],
        suspicious: [],
      }),
      buildSkippedResult: jest.fn().mockReturnValue({
        reviews: [],
        sources: [],
        features: [],
        strengths: [],
        techStack: [],
        weaknesses: [],
        integrations: [],
        productPages: [],
        customerReviews: { summary: "", sentiment: "neutral" },
        webSearchSkipped: true,
        dataProvenance: { fromWebsite: [] },
      }),
    } as unknown as jest.Mocked<EnrichmentService>;

    moduleRef = {
      get: jest.fn().mockReturnValue(null),
    } as unknown as jest.Mocked<ModuleRef>;

    notifications = {
      createAndBroadcast: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<NotificationService>;

    storage = {
      exists: jest.fn().mockResolvedValue(true),
    } as unknown as jest.Mocked<StorageService>;

    service = new PipelineService(
      drizzle,
      queue,
      notifications,
      stateService,
      pipelineStateSnapshots,
      aiConfig,
      startupMatching,
      pipelineFeedback,
      progressTracker,
      phaseTransition,
      errorRecovery,
      pipelineTemplateService,
      enrichmentService,
      storage,
      moduleRef,
    );
  });

  it("starts pipeline and enqueues extraction + scraping", async () => {
    stateService.get.mockResolvedValueOnce(null);
    stateService.init.mockResolvedValueOnce(createState());

    const runId = await service.startPipeline("startup-1", "user-1");

    expect(runId).toBe("run-1");
    expect(progressTracker.initProgress).toHaveBeenCalledTimes(1);
    expect(queue.addJob).toHaveBeenCalledTimes(2);
    expect(stateService.updatePhase).toHaveBeenCalledWith(
      "startup-1",
      PipelinePhase.EXTRACTION,
      PhaseStatus.WAITING,
      undefined,
    );
    expect(stateService.updatePhase).toHaveBeenCalledWith(
      "startup-1",
      PipelinePhase.SCRAPING,
      PhaseStatus.WAITING,
      undefined,
    );
    expect(notifications.createAndBroadcast).toHaveBeenCalledWith(
      "user-1",
      expect.stringContaining("Analysis started"),
      "AI pipeline analysis has started.",
      expect.any(String),
      "/admin/startup/startup-1",
    );
  });

  it("rejects pipeline start when feature flag is disabled", async () => {
    aiConfig.isPipelineEnabled.mockReturnValueOnce(false);

    await expect(service.startPipeline("startup-1", "user-1")).rejects.toThrow(
      BadRequestException,
    );
    expect(stateService.init).not.toHaveBeenCalled();
  });

  it("rejects concurrent pipeline start requests", async () => {
    stateService.get.mockResolvedValueOnce(
      createState({ status: PipelineStatus.RUNNING }),
    );

    await expect(service.startPipeline("startup-1", "user-1")).rejects.toThrow(
      BadRequestException,
    );
    expect(stateService.init).not.toHaveBeenCalled();
  });

  it("rejects pipeline start when pitch deck path is missing in storage", async () => {
    stateService.get.mockResolvedValueOnce(null);
    mockDb.limit.mockImplementationOnce(() =>
      Promise.resolve([{ pitchDeckPath: "startups/deck.pdf" }]),
    );
    storage.exists.mockResolvedValueOnce(false);

    await expect(service.startPipeline("startup-1", "user-1")).rejects.toThrow(
      BadRequestException,
    );

    expect(storage.exists).toHaveBeenCalledWith("startups/deck.pdf");
    expect(stateService.init).not.toHaveBeenCalled();
  });

  it("queues next phase when transition service returns queue entries", async () => {
    stateService.get.mockResolvedValue(createState());
    phaseTransition.decideNextPhases.mockReturnValueOnce({
      queue: [PipelinePhase.RESEARCH],
      blockedByRequiredFailure: false,
      pipelineComplete: false,
      degraded: false,
    });

    await service.onPhaseCompleted("startup-1", PipelinePhase.SCRAPING);

    expect(progressTracker.updatePhaseProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        phase: PipelinePhase.SCRAPING,
        status: PhaseStatus.COMPLETED,
      }),
    );
    expect(queue.addJob).toHaveBeenCalledWith(
      "ai-research",
      expect.objectContaining({
        type: "ai_research",
        startupId: "startup-1",
      }),
      expect.any(Object),
    );
  });

  it("skips enrichment phase entirely when enrichment is disabled", async () => {
    aiConfig.isEnrichmentEnabled.mockReturnValueOnce(false);
    stateService.get.mockResolvedValueOnce(createState());

    await (service as any).queuePhase({
      startupId: "startup-1",
      pipelineRunId: "run-1",
      userId: "user-1",
      phase: PipelinePhase.ENRICHMENT,
    });

    expect(enrichmentService.assessNeed).not.toHaveBeenCalled();
    expect(enrichmentService.buildSkippedResult).toHaveBeenCalledWith(
      "Enrichment temporarily disabled by configuration",
    );
    expect(stateService.setPhaseResult).toHaveBeenCalledWith(
      "startup-1",
      PipelinePhase.ENRICHMENT,
      expect.any(Object),
    );
    expect(stateService.updatePhase).toHaveBeenCalledWith(
      "startup-1",
      PipelinePhase.ENRICHMENT,
      PhaseStatus.SKIPPED,
    );
    expect(progressTracker.updatePhaseProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        phase: PipelinePhase.ENRICHMENT,
        status: PhaseStatus.SKIPPED,
      }),
    );
    expect(queue.addJob).not.toHaveBeenCalled();
  });

  it("does not queue scraping twice when enrichment is skipped during transitions", async () => {
    aiConfig.isEnrichmentEnabled.mockReturnValue(false);

    const beforeSkip = createState(
      {},
      {
        [PipelinePhase.EXTRACTION]: PhaseStatus.COMPLETED,
        [PipelinePhase.ENRICHMENT]: PhaseStatus.PENDING,
        [PipelinePhase.SCRAPING]: PhaseStatus.PENDING,
      },
    );
    const afterSkip = createState(
      {},
      {
        [PipelinePhase.EXTRACTION]: PhaseStatus.COMPLETED,
        [PipelinePhase.ENRICHMENT]: PhaseStatus.SKIPPED,
        [PipelinePhase.SCRAPING]: PhaseStatus.PENDING,
      },
    );
    const scrapingAlreadyWaiting = createState(
      {},
      {
        [PipelinePhase.EXTRACTION]: PhaseStatus.COMPLETED,
        [PipelinePhase.ENRICHMENT]: PhaseStatus.SKIPPED,
        [PipelinePhase.SCRAPING]: PhaseStatus.WAITING,
      },
    );

    stateService.get
      .mockResolvedValueOnce(beforeSkip) // applyTransitions outer refresh
      .mockResolvedValueOnce(beforeSkip) // queuePhase(enrichment) preflight
      .mockResolvedValueOnce(beforeSkip) // onPhaseSkipped state check
      .mockResolvedValueOnce(afterSkip) // applyTransitions recursive refresh
      .mockResolvedValueOnce(afterSkip) // queuePhase(scraping) from recursive applyTransitions
      .mockResolvedValueOnce(scrapingAlreadyWaiting); // duplicate queue attempt from outer loop

    phaseTransition.decideNextPhases
      .mockReturnValueOnce({
        queue: [PipelinePhase.ENRICHMENT, PipelinePhase.SCRAPING],
        blockedByRequiredFailure: false,
        pipelineComplete: false,
        degraded: false,
      })
      .mockReturnValueOnce({
        queue: [PipelinePhase.SCRAPING],
        blockedByRequiredFailure: false,
        pipelineComplete: false,
        degraded: false,
      });

    await (service as any).applyTransitions("startup-1");

    expect(queue.addJob).toHaveBeenCalledTimes(1);
    expect(queue.addJob).toHaveBeenCalledWith(
      "ai-scraping",
      expect.objectContaining({
        type: "ai_scraping",
        startupId: "startup-1",
      }),
      expect.any(Object),
    );

    const scrapingWaitingCalls = stateService.updatePhase.mock.calls.filter(
      (call) =>
        call[1] === PipelinePhase.SCRAPING &&
        call[2] === PhaseStatus.WAITING,
    );
    expect(scrapingWaitingCalls).toHaveLength(1);
  });

  it("ignores stale phase skip requests from older pipeline runs", async () => {
    stateService.get.mockResolvedValueOnce(
      createState({ pipelineRunId: "run-current" }),
    );

    const applied = await service.onPhaseSkipped({
      startupId: "startup-1",
      pipelineRunId: "run-old",
      userId: "user-1",
      phase: PipelinePhase.ENRICHMENT,
      reason: "stale skip",
    });

    expect(applied).toBe(false);
    expect(stateService.updatePhase).not.toHaveBeenCalledWith(
      "startup-1",
      PipelinePhase.ENRICHMENT,
      PhaseStatus.SKIPPED,
    );
  });

  it("retries failed phase with delay while retries remain", async () => {
    stateService.get.mockResolvedValue(createState());
    stateService.incrementRetryCount.mockResolvedValueOnce(1);
    phaseTransition.getPhaseConfig.mockReturnValueOnce({
      ...phaseConfig[PipelinePhase.EXTRACTION],
      maxRetries: 2,
    } as any);
    errorRecovery.getRetryDelayMs.mockReturnValueOnce(1500);

    await service.onPhaseFailed(
      "startup-1",
      PipelinePhase.EXTRACTION,
      "provider unavailable",
    );

    expect(stateService.updatePhase).toHaveBeenCalledWith(
      "startup-1",
      PipelinePhase.EXTRACTION,
      PhaseStatus.WAITING,
      "provider unavailable",
    );
    expect(queue.addJob).toHaveBeenCalledWith(
      "ai-extraction",
      expect.objectContaining({ type: "ai_extraction" }),
      expect.objectContaining({ delay: 1500 }),
    );
    expect(errorRecovery.recordFailure).toHaveBeenCalledTimes(1);
  });

  it("completes pipeline in degraded mode when required phase fails after retries", async () => {
    const state = createState();
    stateService.get.mockResolvedValue(state);
    stateService.incrementRetryCount.mockResolvedValueOnce(3);
    phaseTransition.getPhaseConfig.mockReturnValue({
      ...phaseConfig[PipelinePhase.EVALUATION],
      maxRetries: 2,
    } as any);
    phaseTransition.decideNextPhases.mockReturnValue({
      queue: [],
      blockedByRequiredFailure: true,
      pipelineComplete: true,
      degraded: true,
    });

    await service.onPhaseFailed(
      "startup-1",
      PipelinePhase.EVALUATION,
      "too many failures",
    );

    expect(stateService.setQuality).toHaveBeenCalledWith(
      "startup-1",
      "degraded",
    );
    expect(stateService.setStatus).toHaveBeenCalledWith(
      "startup-1",
      PipelineStatus.COMPLETED,
    );
    expect(progressTracker.setPipelineStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        status: PipelineStatus.COMPLETED,
      }),
    );
    expect(notifications.createAndBroadcast).toHaveBeenCalledWith(
      "user-1",
      expect.stringContaining("Analysis completed with warnings"),
      "too many failures",
      expect.any(String),
      "/admin/startup/startup-1",
    );
  });

  it("continues pipeline in degraded mode when optional phase exhausts retries", async () => {
    const state = createState({}, {
      [PipelinePhase.RESEARCH]: PhaseStatus.FAILED,
      [PipelinePhase.EVALUATION]: PhaseStatus.PENDING,
    });
    stateService.get.mockResolvedValue(state);
    stateService.incrementRetryCount.mockResolvedValueOnce(3);
    phaseTransition.getPhaseConfig.mockReturnValueOnce({
      ...phaseConfig[PipelinePhase.RESEARCH],
      maxRetries: 2,
      required: false,
    } as any);
    phaseTransition.decideNextPhases.mockReturnValueOnce({
      queue: [PipelinePhase.EVALUATION],
      blockedByRequiredFailure: false,
      pipelineComplete: false,
      degraded: true,
    });

    await service.onPhaseFailed(
      "startup-1",
      PipelinePhase.RESEARCH,
      "research failed",
    );

    expect(stateService.setQuality).toHaveBeenCalledWith(
      "startup-1",
      "degraded",
    );
    expect(queue.addJob).toHaveBeenCalledWith(
      "ai-evaluation",
      expect.objectContaining({ type: "ai_evaluation" }),
      expect.any(Object),
    );
    expect(stateService.setStatus).not.toHaveBeenCalledWith(
      "startup-1",
      PipelineStatus.FAILED,
    );
  });

  it("marks pipeline quality degraded when evaluation result is below threshold", async () => {
    stateService.get.mockResolvedValue(createState());
    stateService.getPhaseResult.mockResolvedValueOnce({
      summary: {
        completedAgents: 6,
        minimumRequired: 8,
        degraded: true,
      },
    });

    await service.onPhaseCompleted("startup-1", PipelinePhase.EVALUATION);

    expect(stateService.setQuality).toHaveBeenCalledWith(
      "startup-1",
      "degraded",
    );
  });

  it("marks pipeline completed when synthesis is the final completed phase", async () => {
    const state = createState({}, {
      [PipelinePhase.EXTRACTION]: PhaseStatus.COMPLETED,
      [PipelinePhase.SCRAPING]: PhaseStatus.COMPLETED,
      [PipelinePhase.RESEARCH]: PhaseStatus.COMPLETED,
      [PipelinePhase.EVALUATION]: PhaseStatus.COMPLETED,
      [PipelinePhase.SYNTHESIS]: PhaseStatus.COMPLETED,
    });
    stateService.get.mockResolvedValue(state);
    stateService.getPhaseResult.mockResolvedValueOnce({
      overallScore: 88,
    });
    phaseTransition.decideNextPhases.mockReturnValueOnce({
      queue: [],
      blockedByRequiredFailure: false,
      pipelineComplete: true,
      degraded: false,
    });

    await service.onPhaseCompleted("startup-1", PipelinePhase.SYNTHESIS);

    expect(stateService.setStatus).toHaveBeenCalledWith(
      "startup-1",
      PipelineStatus.COMPLETED,
    );
    expect(progressTracker.setPipelineStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        status: PipelineStatus.COMPLETED,
        overallScore: 88,
      }),
    );
    expect(mockDb.set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "pending_review",
      }),
    );
    expect(notifications.createAndBroadcast).toHaveBeenCalledWith(
      "user-1",
      expect.stringContaining("Analysis completed"),
      "AI pipeline analysis completed successfully.",
      expect.any(String),
      "/admin/startup/startup-1",
    );
  });

  it("queues deferred matching when startup was already approved", async () => {
    const state = createState({}, {
      [PipelinePhase.EXTRACTION]: PhaseStatus.COMPLETED,
      [PipelinePhase.SCRAPING]: PhaseStatus.COMPLETED,
      [PipelinePhase.RESEARCH]: PhaseStatus.COMPLETED,
      [PipelinePhase.EVALUATION]: PhaseStatus.COMPLETED,
      [PipelinePhase.SYNTHESIS]: PhaseStatus.COMPLETED,
    });
    stateService.get.mockResolvedValue(state);
    stateService.getPhaseResult.mockResolvedValueOnce({
      overallScore: 91,
    });
    phaseTransition.decideNextPhases.mockReturnValueOnce({
      queue: [],
      blockedByRequiredFailure: false,
      pipelineComplete: true,
      degraded: false,
    });
    mockDb.limit.mockResolvedValue([{ status: "approved", name: "Test Startup" }]);

    await service.onPhaseCompleted("startup-1", PipelinePhase.SYNTHESIS);

    expect(startupMatching.queueStartupMatching).toHaveBeenCalledWith({
      startupId: "startup-1",
      requestedBy: "user-1",
      triggerSource: "pipeline_completion",
    });
  });

  it("cancels pipeline and removes queued jobs", async () => {
    stateService.get.mockResolvedValueOnce(createState());
    queue.removePipelineJobs.mockResolvedValueOnce(4);

    const result = await service.cancelPipeline("startup-1");

    expect(result).toEqual({ removedJobs: 4 });
    expect(stateService.setStatus).toHaveBeenCalledWith(
      "startup-1",
      PipelineStatus.CANCELLED,
    );
    expect(progressTracker.setPipelineStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        status: PipelineStatus.CANCELLED,
      }),
    );
    expect(errorRecovery.clearAllTimeoutsForStartup).toHaveBeenCalledWith(
      "startup-1",
    );
    expect(notifications.createAndBroadcast).toHaveBeenCalledWith(
      "user-1",
      expect.stringContaining("Analysis cancelled"),
      "AI pipeline analysis was cancelled.",
      expect.any(String),
      "/admin/startup/startup-1",
    );
  });

  it("retries a failed phase manually", async () => {
    stateService.get.mockResolvedValueOnce(
      createState({ status: PipelineStatus.FAILED }, {
        [PipelinePhase.EVALUATION]: PhaseStatus.FAILED,
      }),
    );

    await service.retryPhase("startup-1", PipelinePhase.EVALUATION);

    expect(stateService.clearPhaseResult).toHaveBeenCalledWith(
      "startup-1",
      PipelinePhase.EVALUATION,
    );
    expect(stateService.resetRetryCount).toHaveBeenCalledWith(
      "startup-1",
      PipelinePhase.EVALUATION,
    );
    expect(queue.addJob).toHaveBeenCalledWith(
      "ai-evaluation",
      expect.objectContaining({
        type: "ai_evaluation",
      }),
      expect.any(Object),
    );
    expect(stateService.setPipelineRunId).toHaveBeenCalledWith(
      "startup-1",
      expect.any(String),
    );
  });

  it("force-reruns from a selected phase and clears downstream state", async () => {
    stateService.get.mockResolvedValueOnce(
      createState(
        {},
        {
          [PipelinePhase.EXTRACTION]: PhaseStatus.COMPLETED,
          [PipelinePhase.SCRAPING]: PhaseStatus.COMPLETED,
          [PipelinePhase.RESEARCH]: PhaseStatus.COMPLETED,
          [PipelinePhase.EVALUATION]: PhaseStatus.COMPLETED,
          [PipelinePhase.SYNTHESIS]: PhaseStatus.COMPLETED,
        },
      ),
    );

    await service.rerunFromPhase("startup-1", PipelinePhase.RESEARCH);

    expect(queue.removePipelineJobs).toHaveBeenCalledWith("startup-1");
    expect(stateService.clearPhaseResult).toHaveBeenCalledWith(
      "startup-1",
      PipelinePhase.RESEARCH,
    );
    expect(stateService.clearPhaseResult).toHaveBeenCalledWith(
      "startup-1",
      PipelinePhase.EVALUATION,
    );
    expect(stateService.clearPhaseResult).toHaveBeenCalledWith(
      "startup-1",
      PipelinePhase.SYNTHESIS,
    );
    expect(queue.addJob).toHaveBeenCalledWith(
      "ai-research",
      expect.objectContaining({ type: "ai_research" }),
      expect.any(Object),
    );
    expect(stateService.setPipelineRunId).toHaveBeenCalledWith(
      "startup-1",
      expect.any(String),
    );
  });

  it("queues targeted research agent retry and resets downstream phases", async () => {
    stateService.get.mockResolvedValueOnce(
      createState({}, {
        [PipelinePhase.ENRICHMENT]: PhaseStatus.COMPLETED,
        [PipelinePhase.EXTRACTION]: PhaseStatus.COMPLETED,
        [PipelinePhase.SCRAPING]: PhaseStatus.COMPLETED,
        [PipelinePhase.RESEARCH]: PhaseStatus.COMPLETED,
        [PipelinePhase.EVALUATION]: PhaseStatus.COMPLETED,
        [PipelinePhase.SYNTHESIS]: PhaseStatus.COMPLETED,
      }),
    );

    await service.retryAgent("startup-1", {
      phase: PipelinePhase.RESEARCH,
      agentKey: "market",
    });

    expect(stateService.resetPhaseStatus).toHaveBeenCalledWith(
      "startup-1",
      PipelinePhase.RESEARCH,
    );
    expect(stateService.resetPhase).toHaveBeenCalledWith(
      "startup-1",
      PipelinePhase.EVALUATION,
    );
    expect(stateService.resetPhase).toHaveBeenCalledWith(
      "startup-1",
      PipelinePhase.SYNTHESIS,
    );
    expect(stateService.clearPhaseResult).toHaveBeenCalledWith(
      "startup-1",
      PipelinePhase.EVALUATION,
    );
    expect(stateService.clearPhaseResult).toHaveBeenCalledWith(
      "startup-1",
      PipelinePhase.SYNTHESIS,
    );
    expect(queue.addJob).toHaveBeenCalledWith(
      "ai-research",
      expect.objectContaining({
        metadata: expect.objectContaining({
          mode: "agent_retry",
          agentKey: "market",
        }),
      }),
      expect.any(Object),
    );
    expect(stateService.setPipelineRunId).toHaveBeenCalledWith(
      "startup-1",
      expect.any(String),
    );
    expect(progressTracker.initProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        startupId: "startup-1",
        userId: "user-1",
        currentPhase: PipelinePhase.RESEARCH,
        initialPhaseStatuses: expect.objectContaining({
          [PipelinePhase.ENRICHMENT]: PhaseStatus.COMPLETED,
          [PipelinePhase.EXTRACTION]: PhaseStatus.COMPLETED,
          [PipelinePhase.SCRAPING]: PhaseStatus.COMPLETED,
          [PipelinePhase.RESEARCH]: PhaseStatus.COMPLETED,
          [PipelinePhase.EVALUATION]: PhaseStatus.COMPLETED,
          [PipelinePhase.SYNTHESIS]: PhaseStatus.COMPLETED,
        }),
      }),
    );
  });

  it("rejects targeted retry when the phase is running", async () => {
    stateService.get.mockResolvedValueOnce(
      createState({}, {
        [PipelinePhase.EVALUATION]: PhaseStatus.RUNNING,
      }),
    );

    await expect(
      service.retryAgent("startup-1", {
        phase: PipelinePhase.EVALUATION,
        agentKey: "market",
      }),
    ).rejects.toThrow(BadRequestException);

    expect(queue.addJob).not.toHaveBeenCalled();
  });

  it("rejects manual retry when phase is not failed", async () => {
    stateService.get.mockResolvedValueOnce(
      createState({}, {
        [PipelinePhase.EVALUATION]: PhaseStatus.RUNNING,
      }),
    );

    await expect(
      service.retryPhase("startup-1", PipelinePhase.EVALUATION),
    ).rejects.toThrow(BadRequestException);
    expect(queue.addJob).not.toHaveBeenCalled();
  });

  it("marks active phase failed and retries when timeout handler fires", async () => {
    stateService.get.mockResolvedValueOnce(createState({}, {
      [PipelinePhase.RESEARCH]: PhaseStatus.WAITING,
    }));
    stateService.incrementRetryCount.mockResolvedValueOnce(1);
    phaseTransition.getPhaseConfig.mockReturnValueOnce({
      ...phaseConfig[PipelinePhase.RESEARCH],
      maxRetries: 2,
    } as any);
    errorRecovery.getRetryDelayMs.mockReturnValueOnce(2000);

    await (service as any).handlePhaseTimeout(
      "startup-1",
      PipelinePhase.RESEARCH,
    );

    expect(stateService.updatePhase).toHaveBeenCalledWith(
      "startup-1",
      PipelinePhase.RESEARCH,
      PhaseStatus.FAILED,
      'Phase "research" timed out',
    );
    expect(queue.addJob).toHaveBeenCalledWith(
      "ai-research",
      expect.objectContaining({
        type: "ai_research",
      }),
      expect.objectContaining({
        delay: 2000,
      }),
    );
  });

  it("ignores timeout handler when phase is already terminal", async () => {
    stateService.get.mockResolvedValue(
      createState({}, {
        [PipelinePhase.RESEARCH]: PhaseStatus.COMPLETED,
      }),
    );

    await (service as any).handlePhaseTimeout(
      "startup-1",
      PipelinePhase.RESEARCH,
    );

    expect(stateService.updatePhase).not.toHaveBeenCalled();
    expect(queue.addJob).not.toHaveBeenCalled();
  });

  it("no-ops completion and failure callbacks when pipeline state is missing", async () => {
    stateService.get.mockResolvedValue(null);

    await service.onPhaseCompleted("startup-1", PipelinePhase.EXTRACTION);
    await service.onPhaseFailed(
      "startup-1",
      PipelinePhase.EXTRACTION,
      "missing",
    );

    expect(progressTracker.updatePhaseProgress).not.toHaveBeenCalled();
  });

  it("forwards agent progress updates to progress tracker", async () => {
    await service.onAgentProgress({
      startupId: "startup-1",
      userId: "user-1",
      pipelineRunId: "run-1",
      phase: PipelinePhase.EVALUATION,
      key: "team",
      status: "completed",
      progress: 100,
    });

    expect(progressTracker.updateAgentProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        key: "team",
        status: "completed",
      }),
    );
  });

  describe("queuePhase with optional parameters", () => {
    it("queues phase with all optional params: delayMs, retryCount, waitingError, metadata", async () => {
      stateService.get.mockResolvedValueOnce(createState());

      await (service as any).queuePhase({
        startupId: "startup-1",
        pipelineRunId: "run-1",
        userId: "user-1",
        phase: PipelinePhase.EXTRACTION,
        delayMs: 2500,
        retryCount: 2,
        waitingError: "previous failure",
        metadata: { mode: "agent_retry", agentKey: "team" },
      });

      expect(stateService.updatePhase).toHaveBeenCalledWith(
        "startup-1",
        PipelinePhase.EXTRACTION,
        PhaseStatus.WAITING,
        "previous failure",
      );
      expect(queue.addJob).toHaveBeenCalledWith(
        "ai-extraction",
        expect.objectContaining({
          metadata: {
            retryCount: 2,
            mode: "agent_retry",
            agentKey: "team",
          },
        }),
        expect.objectContaining({
          delay: 2500,
        }),
      );
      expect(errorRecovery.schedulePhaseTimeout).toHaveBeenCalledWith(
        expect.objectContaining({
          startupId: "startup-1",
          phase: PipelinePhase.EXTRACTION,
          timeoutMs: 1000 + 2500,
        }),
      );
    });

    it("queues phase with defaults when optional params omitted", async () => {
      stateService.get.mockResolvedValueOnce(createState());

      await (service as any).queuePhase({
        startupId: "startup-1",
        pipelineRunId: "run-1",
        userId: "user-1",
        phase: PipelinePhase.SCRAPING,
      });

      expect(stateService.updatePhase).toHaveBeenCalledWith(
        "startup-1",
        PipelinePhase.SCRAPING,
        PhaseStatus.WAITING,
        undefined,
      );
      expect(queue.addJob).toHaveBeenCalledWith(
        "ai-scraping",
        expect.objectContaining({
          metadata: {
            retryCount: 0,
          },
        }),
        expect.objectContaining({
          delay: 0,
        }),
      );
    });

    it("extends research phase timeout budget to support deep-research agents", async () => {
      stateService.get.mockResolvedValueOnce(createState());

      aiConfig.getResearchAgentHardTimeoutMs = jest.fn().mockReturnValue(3_600_000);
      aiConfig.getResearchAgentStaggerMs = jest.fn().mockReturnValue(180_000);

      await (service as any).queuePhase({
        startupId: "startup-1",
        pipelineRunId: "run-1",
        userId: "user-1",
        phase: PipelinePhase.RESEARCH,
      });

      expect(errorRecovery.schedulePhaseTimeout).toHaveBeenCalledWith(
        expect.objectContaining({
          startupId: "startup-1",
          phase: PipelinePhase.RESEARCH,
          timeoutMs: 7_740_000,
        }),
      );
    });
  });

  describe("isValidAgentForPhase", () => {
    it("returns true for valid research agent key", () => {
      expect((service as any).isValidAgentForPhase(PipelinePhase.RESEARCH, "team")).toBe(true);
      expect((service as any).isValidAgentForPhase(PipelinePhase.RESEARCH, "market")).toBe(true);
      expect((service as any).isValidAgentForPhase(PipelinePhase.RESEARCH, "product")).toBe(true);
      expect((service as any).isValidAgentForPhase(PipelinePhase.RESEARCH, "news")).toBe(true);
    });

    it("returns true for valid evaluation agent key", () => {
      expect((service as any).isValidAgentForPhase(PipelinePhase.EVALUATION, "team")).toBe(true);
      expect((service as any).isValidAgentForPhase(PipelinePhase.EVALUATION, "market")).toBe(true);
      expect((service as any).isValidAgentForPhase(PipelinePhase.EVALUATION, "financials")).toBe(true);
      expect((service as any).isValidAgentForPhase(PipelinePhase.EVALUATION, "exitPotential")).toBe(true);
    });

    it("returns false for invalid agent key", () => {
      expect((service as any).isValidAgentForPhase(PipelinePhase.RESEARCH, "invalid_agent")).toBe(false);
      expect((service as any).isValidAgentForPhase(PipelinePhase.EVALUATION, "nonexistent")).toBe(false);
    });
  });

  describe("startPipeline edge cases", () => {
    it("throws when pipeline is already running", async () => {
      stateService.get.mockResolvedValueOnce(
        createState({ status: PipelineStatus.RUNNING }),
      );

      await expect(service.startPipeline("startup-1", "user-1")).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.startPipeline("startup-1", "user-1")).rejects.toThrow(
        "Pipeline already running for startup startup-1",
      );
      expect(stateService.init).not.toHaveBeenCalled();
    });

    it("throws when pipeline is disabled via config", async () => {
      aiConfig.isPipelineEnabled.mockReturnValueOnce(false);
      stateService.get.mockResolvedValueOnce(null);

      const promise = service.startPipeline("startup-1", "user-1");

      await expect(promise).rejects.toThrow(BadRequestException);
      await expect(promise).rejects.toThrow("AI pipeline is disabled");
      expect(stateService.init).not.toHaveBeenCalled();
    });
  });

  describe("getClaraService", () => {
    it("returns null gracefully when Clara module not loaded", () => {
      const clara = (service as any).getClaraService();

      expect(clara).toBeNull();
    });

    it("caches Clara service after first successful load", () => {
      const mockClaraService = { isEnabled: jest.fn().mockReturnValue(true) };
      moduleRef.get.mockReturnValueOnce(mockClaraService);

      const clara1 = (service as any).getClaraService();
      const clara2 = (service as any).getClaraService();

      expect(moduleRef.get).toHaveBeenCalledTimes(1);
      expect(clara1).toBe(mockClaraService);
      expect(clara2).toBe(mockClaraService);
    });
  });

  describe("retryAgent edge cases", () => {
    it("rejects retry when agent key is invalid for the phase", async () => {
      stateService.get.mockResolvedValueOnce(
        createState({}, {
          [PipelinePhase.RESEARCH]: PhaseStatus.FAILED,
        }),
      );

      await expect(
        service.retryAgent("startup-1", {
          phase: PipelinePhase.RESEARCH,
          agentKey: "invalidAgent" as any,
        }),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.retryAgent("startup-1", {
          phase: PipelinePhase.RESEARCH,
          agentKey: "invalidAgent" as any,
        }),
      ).rejects.toThrow('Agent "invalidAgent" is not valid for phase "research"');

      expect(queue.addJob).not.toHaveBeenCalled();
    });

    it("rejects retry when phase is in pending state", async () => {
      stateService.get.mockResolvedValueOnce(
        createState({}, {
          [PipelinePhase.EVALUATION]: PhaseStatus.PENDING,
        }),
      );

      await expect(
        service.retryAgent("startup-1", {
          phase: PipelinePhase.EVALUATION,
          agentKey: "market",
        }),
      ).rejects.toThrow(BadRequestException);

      expect(queue.addJob).not.toHaveBeenCalled();
    });

    it("rejects retry when phase is in waiting state", async () => {
      stateService.get.mockResolvedValueOnce(
        createState({}, {
          [PipelinePhase.RESEARCH]: PhaseStatus.WAITING,
        }),
      );

      await expect(
        service.retryAgent("startup-1", {
          phase: PipelinePhase.RESEARCH,
          agentKey: "team",
        }),
      ).rejects.toThrow(BadRequestException);

      expect(queue.addJob).not.toHaveBeenCalled();
    });
  });
});
