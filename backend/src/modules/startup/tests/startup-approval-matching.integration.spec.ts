import { beforeEach, describe, expect, it, jest } from "bun:test";
import { ModuleRef } from "@nestjs/core";
import { StartupService } from "../startup.service";
import { DraftService } from "../draft.service";
import { DrizzleService } from "../../../database";
import { QueueService } from "../../../queue";
import { StorageService } from "../../../storage";
import { StartupStatus, StartupStage, startup } from "../entities/startup.schema";
import { AiConfigService } from "../../ai/services/ai-config.service";
import { PipelineService } from "../../ai/services/pipeline.service";
import { PipelineStateSnapshotService } from "../../ai/services/pipeline-state-snapshot.service";
import { PipelineFeedbackService } from "../../ai/services/pipeline-feedback.service";
import { StartupMatchingPipelineService } from "../../ai/services/startup-matching-pipeline.service";
import { EnrichmentService } from "../../ai/services/enrichment.service";
import { PipelineTemplateService } from "../../ai/services/pipeline-template.service";
import { NotificationService } from "../../../notification/notification.service";
import { InvestorMatchingService } from "../../ai/services/investor-matching.service";
import { PipelineStateService } from "../../ai/services/pipeline-state.service";
import { PhaseTransitionService } from "../../ai/orchestrator/phase-transition.service";
import { ProgressTrackerService } from "../../ai/orchestrator/progress-tracker.service";
import { ErrorRecoveryService } from "../../ai/orchestrator/error-recovery.service";
import {
  AnalysisJobPriority,
  AnalysisJobStatus,
  AnalysisJobType,
  analysisJob,
} from "../../analysis/entities/analysis.schema";
import {
  PhaseStatus,
  PipelinePhase,
  PipelineStatus,
  type PipelineState,
} from "../../ai/interfaces/pipeline.interface";

interface MockStartupRecord {
  id: string;
  userId: string;
  name: string;
  slug: string;
  tagline: string;
  description: string;
  website: string;
  location: string;
  industry: string;
  stage: StartupStage;
  fundingTarget: number;
  teamSize: number;
  status: StartupStatus;
  isPrivate: boolean;
  submittedByRole: string;
  geoPath: string[];
  createdAt: Date;
  updatedAt: Date;
  submittedAt: Date | null;
  approvedAt: Date | null;
}

interface MockAnalysisJobRecord {
  id: string;
  startupId: string;
  jobType: AnalysisJobType;
  status: AnalysisJobStatus;
  priority: AnalysisJobPriority;
  result?: Record<string, unknown>;
  errorMessage?: string | null;
  createdAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
}

function createPipelineState(): PipelineState {
  return {
    pipelineRunId: "run-1",
    startupId: "startup-1",
    userId: "founder-1",
    status: PipelineStatus.RUNNING,
    quality: "standard",
    currentPhase: PipelinePhase.SYNTHESIS,
    phases: {
      [PipelinePhase.EXTRACTION]: { status: PhaseStatus.COMPLETED },
      [PipelinePhase.SCRAPING]: { status: PhaseStatus.COMPLETED },
      [PipelinePhase.RESEARCH]: { status: PhaseStatus.COMPLETED },
      [PipelinePhase.EVALUATION]: { status: PhaseStatus.COMPLETED },
      [PipelinePhase.SYNTHESIS]: { status: PhaseStatus.RUNNING },
    },
    results: {},
    retryCounts: {},
    telemetry: {
      startedAt: new Date().toISOString(),
      totalTokens: { input: 0, output: 0 },
      phases: {
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
  };
}

describe("Startup lifecycle integration: submit -> pipeline complete -> approve -> matching complete", () => {
  let startupService: StartupService;
  let lifecyclePipelineService: PipelineService;
  let matchingPipelineService: StartupMatchingPipelineService;

  let drizzle: jest.Mocked<DrizzleService>;
  let queue: jest.Mocked<QueueService>;
  let draftService: jest.Mocked<DraftService>;
  let storage: jest.Mocked<StorageService>;
  let aiConfig: jest.Mocked<AiConfigService>;
  let startupPipeline: jest.Mocked<PipelineService>;
  let pipelineFeedback: jest.Mocked<PipelineFeedbackService>;
  let matchingState: jest.Mocked<PipelineStateService>;
  let investorMatching: jest.Mocked<InvestorMatchingService>;
  let notifications: jest.Mocked<NotificationService>;

  let startupRecord: MockStartupRecord;
  const analysisJobs: MockAnalysisJobRecord[] = [];
  const context: {
    mode: "select" | "update" | "insert" | null;
    table: unknown;
  } = {
    mode: null,
    table: null,
  };

  const mockDb = {
    select: jest.fn(() => {
      context.mode = "select";
      return mockDb;
    }),
    from: jest.fn((tableRef: unknown) => {
      context.table = tableRef;
      return mockDb;
    }),
    where: jest.fn(() => mockDb),
    limit: jest.fn(async () => {
      if (context.mode !== "select") {
        return [];
      }

      if (context.table === startup) {
        return [{ ...startupRecord }];
      }

      if (context.table === analysisJob) {
        const latest = analysisJobs.at(-1);
        return latest ? [{ ...latest }] : [];
      }

      return [];
    }),
    offset: jest.fn(() => mockDb),
    orderBy: jest.fn(() => mockDb),
    insert: jest.fn((tableRef: unknown) => {
      context.mode = "insert";
      context.table = tableRef;
      return mockDb;
    }),
    values: jest.fn((values: Record<string, unknown>) => {
      if (context.mode === "insert" && context.table === analysisJob) {
        analysisJobs.push({
          id: "analysis-job-1",
          startupId: values.startupId as string,
          jobType: values.jobType as AnalysisJobType,
          status: values.status as AnalysisJobStatus,
          priority: values.priority as AnalysisJobPriority,
          result: values.result as Record<string, unknown>,
          errorMessage: null,
          createdAt: new Date(),
          startedAt: null,
          completedAt: null,
        });
      }

      return mockDb;
    }),
    returning: jest.fn(async () => {
      if (context.mode === "update" && context.table === startup) {
        return [{ ...startupRecord }];
      }

      if (context.mode === "insert" && context.table === analysisJob) {
        const latest = analysisJobs.at(-1);
        return latest ? [{ ...latest }] : [];
      }

      return [];
    }),
    update: jest.fn((tableRef: unknown) => {
      context.mode = "update";
      context.table = tableRef;
      return mockDb;
    }),
    set: jest.fn((values: Record<string, unknown>) => {
      if (context.mode === "update" && context.table === startup) {
        startupRecord = {
          ...startupRecord,
          ...values,
          updatedAt: new Date(),
        } as MockStartupRecord;
      }

      if (context.mode === "update" && context.table === analysisJob) {
        const latest = analysisJobs.at(-1);
        if (latest) {
          Object.assign(latest, values);
        }
      }

      return mockDb;
    }),
    delete: jest.fn(() => mockDb),
  };

  beforeEach(() => {
    startupRecord = {
      id: "startup-1",
      userId: "founder-1",
      name: "Flow Startup",
      slug: "flow-startup",
      tagline: "Flow",
      description: "Lifecycle test startup description long enough for validation.",
      website: "https://flow-startup.com",
      location: "San Francisco, CA",
      industry: "SaaS",
      stage: StartupStage.SEED,
      fundingTarget: 1500000,
      teamSize: 4,
      status: StartupStatus.DRAFT,
      isPrivate: false,
      submittedByRole: "founder",
      geoPath: ["l1:north_america", "l2:us_canada", "l3:us"],
      createdAt: new Date(),
      updatedAt: new Date(),
      submittedAt: null,
      approvedAt: null,
    };

    analysisJobs.length = 0;
    context.mode = null;
    context.table = null;

    drizzle = {
      db: mockDb,
      withRLS: jest.fn((_, callback) => callback(mockDb as never)),
    } as unknown as jest.Mocked<DrizzleService>;

    queue = {
      addJob: jest.fn().mockResolvedValue("queue-job-1"),
    } as unknown as jest.Mocked<QueueService>;

    draftService = {
      delete: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<DraftService>;

    storage = {
      getUploadUrl: jest.fn(),
    } as unknown as jest.Mocked<StorageService>;

    aiConfig = {
      isPipelineEnabled: jest.fn().mockReturnValue(true),
      getModelForPurpose: jest.fn().mockReturnValue("gemini-3-flash-preview"),
    } as unknown as jest.Mocked<AiConfigService>;

    startupPipeline = {
      startPipeline: jest.fn().mockResolvedValue("run-1"),
      getPipelineStatus: jest.fn().mockResolvedValue(null),
      getTrackedProgress: jest.fn().mockResolvedValue(null),
      retryPhase: jest.fn(),
      rerunFromPhase: jest.fn(),
      retryAgent: jest.fn(),
    } as unknown as jest.Mocked<PipelineService>;

    pipelineFeedback = {
      record: jest.fn().mockResolvedValue({ id: "feedback-1" }),
      markConsumedByScope: jest.fn().mockResolvedValue(0),
    } as unknown as jest.Mocked<PipelineFeedbackService>;

    matchingState = {
      getPhaseResult: jest.fn().mockResolvedValue({
        executiveSummary: "Strong seed SaaS company",
        recommendation: "invest",
        overallScore: 88,
        sectionScores: {
          team: 86,
          market: 87,
          product: 89,
          traction: 84,
          businessModel: 85,
          gtm: 83,
          financials: 80,
          competitiveAdvantage: 84,
          legal: 82,
          dealTerms: 79,
          exitPotential: 81,
        },
      }),
      get: jest.fn().mockResolvedValue(createPipelineState()),
      updatePhase: jest.fn().mockResolvedValue(undefined),
      setQuality: jest.fn().mockResolvedValue(undefined),
      setStatus: jest.fn().mockResolvedValue(undefined),
      resetRetryCount: jest.fn().mockResolvedValue(undefined),
      clearPhaseResult: jest.fn().mockResolvedValue(undefined),
      resetPhase: jest.fn().mockResolvedValue(undefined),
      resetPhaseStatus: jest.fn().mockResolvedValue(undefined),
      setPipelineRunId: jest.fn().mockResolvedValue(undefined),
      incrementRetryCount: jest.fn().mockResolvedValue(0),
    } as unknown as jest.Mocked<PipelineStateService>;

    investorMatching = {
      matchStartup: jest.fn().mockResolvedValue({
        candidatesEvaluated: 3,
        failedCandidates: 0,
        matches: [
          {
            investorId: "investor-1",
            overallScore: 87,
            thesisFitScore: 91,
            compositeFitScore: 90,
            fitRationale: "Strong thesis alignment and stage fit.",
          },
        ],
      }),
    } as unknown as jest.Mocked<InvestorMatchingService>;

    notifications = {
      createBulk: jest.fn().mockResolvedValue(undefined),
      createAndBroadcast: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<NotificationService>;

    matchingPipelineService = new StartupMatchingPipelineService(
      drizzle,
      queue,
      matchingState,
      investorMatching,
      notifications,
    );

    startupService = new StartupService(
      drizzle,
      queue,
      storage,
      draftService,
      aiConfig,
      startupPipeline,
      pipelineFeedback,
      matchingPipelineService,
    );

    const phaseTransition = {
      getConfig: jest.fn().mockReturnValue({
        phases: [
          { phase: PipelinePhase.EXTRACTION },
          { phase: PipelinePhase.SCRAPING },
          { phase: PipelinePhase.RESEARCH },
          { phase: PipelinePhase.EVALUATION },
          { phase: PipelinePhase.SYNTHESIS },
        ],
        minimumEvaluationAgents: 8,
      }),
      decideNextPhases: jest.fn().mockReturnValue({
        queue: [],
        blockedByRequiredFailure: false,
        pipelineComplete: true,
        degraded: false,
      }),
      getPhaseConfig: jest.fn().mockReturnValue({
        maxRetries: 2,
      }),
    } as unknown as jest.Mocked<PhaseTransitionService>;

    const progressTracker = {
      setPipelineStatus: jest.fn().mockResolvedValue(undefined),
      updatePhaseProgress: jest.fn().mockResolvedValue(undefined),
      initProgress: jest.fn().mockResolvedValue(undefined),
      updateAgentProgress: jest.fn().mockResolvedValue(undefined),
      resetPhasesForRerun: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<ProgressTrackerService>;

    const errorRecovery = {
      clearPhaseTimeout: jest.fn(),
      clearAllTimeoutsForStartup: jest.fn(),
      schedulePhaseTimeout: jest.fn(),
      recordFailure: jest.fn().mockResolvedValue(undefined),
      getRetryDelayMs: jest.fn().mockReturnValue(1000),
    } as unknown as jest.Mocked<ErrorRecoveryService>;

    const lifecycleAiConfig = {
      isPipelineEnabled: jest.fn().mockReturnValue(true),
      isEnrichmentEnabled: jest.fn().mockReturnValue(true),
    } as unknown as jest.Mocked<AiConfigService>;

    const moduleRef = {
      get: jest.fn().mockReturnValue(null),
    } as unknown as jest.Mocked<ModuleRef>;

    const pipelineTemplateService = {
      getRuntimeSnapshot: jest.fn().mockResolvedValue(null),
    } as unknown as jest.Mocked<PipelineTemplateService>;

    const enrichmentService = {
      assessNeed: jest.fn().mockResolvedValue({
        shouldRun: true,
        missing: [],
        suspicious: [],
      }),
      buildSkippedResult: jest.fn(),
    } as unknown as jest.Mocked<EnrichmentService>;

    const pipelineStateSnapshots = {
      snapshot: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<PipelineStateSnapshotService>;

    lifecyclePipelineService = new PipelineService(
      drizzle,
      queue,
      notifications,
      matchingState,
      pipelineStateSnapshots,
      lifecycleAiConfig,
      matchingPipelineService,
      pipelineFeedback,
      progressTracker,
      phaseTransition,
      errorRecovery,
      pipelineTemplateService,
      enrichmentService,
      moduleRef,
    );
  });

  it("processes the full lifecycle and ends with completed matching job", async () => {
    await startupService.submit("startup-1", "founder-1");

    expect(startupRecord.status).toBe(StartupStatus.SUBMITTED);
    expect(startupPipeline.startPipeline).toHaveBeenCalledWith(
      "startup-1",
      "founder-1",
    );

    await lifecyclePipelineService.onPhaseCompleted(
      "startup-1",
      PipelinePhase.SYNTHESIS,
    );

    expect(startupRecord.status).toBe(StartupStatus.PENDING_REVIEW);

    const approved = await startupService.approve("startup-1", "admin-1");

    expect(approved.status).toBe(StartupStatus.APPROVED);
    expect(startupRecord.status).toBe(StartupStatus.APPROVED);
    expect(analysisJobs).toHaveLength(1);
    expect(analysisJobs[0].status).toBe(AnalysisJobStatus.PENDING);
    expect(queue.addJob).toHaveBeenCalledWith(
      "ai-matching",
      expect.objectContaining({
        type: "ai_matching",
        startupId: "startup-1",
        triggerSource: "approval",
      }),
      expect.objectContaining({ attempts: 3, priority: 2 }),
    );

    const matchingResult = await matchingPipelineService.processMatchingJob({
      type: "ai_matching",
      startupId: "startup-1",
      analysisJobId: analysisJobs[0].id,
      triggerSource: "approval",
      userId: "admin-1",
      priority: 2,
    });

    expect(matchingResult).toEqual(
      expect.objectContaining({
        triggerSource: "approval",
        candidatesEvaluated: 3,
        matchesFound: 1,
        failedCandidates: 0,
        notificationsSent: 1,
      }),
    );

    expect(analysisJobs[0].status).toBe(AnalysisJobStatus.COMPLETED);
    expect(analysisJobs[0].result).toEqual(
      expect.objectContaining({
        triggerSource: "approval",
        matchesFound: 1,
      }),
    );
    expect(notifications.createBulk).toHaveBeenCalledTimes(1);
  });
});
