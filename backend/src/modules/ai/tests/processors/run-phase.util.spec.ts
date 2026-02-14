import { beforeEach, describe, expect, it, jest } from "bun:test";
import type { Job } from "bullmq";
import { runPipelinePhase } from "../../processors/run-phase.util";
import {
  PhaseStatus,
  PipelinePhase,
  PipelineStatus,
  type PipelineState,
} from "../../interfaces/pipeline.interface";
import type { ResearchResult } from "../../interfaces/phase-results.interface";
import type { PipelineStateService } from "../../services/pipeline-state.service";
import type { PipelineService } from "../../services/pipeline.service";
import type { NotificationGateway } from "../../../../notification/notification.gateway";

function buildState(
  overrides: Partial<PipelineState> = {},
  phaseStatus: PhaseStatus = PhaseStatus.PENDING,
): PipelineState {
  return {
    pipelineRunId: "run-1",
    startupId: "startup-1",
    userId: "user-1",
    status: PipelineStatus.RUNNING,
    quality: "standard",
    currentPhase: PipelinePhase.RESEARCH,
    phases: {
      [PipelinePhase.EXTRACTION]: { status: PhaseStatus.COMPLETED },
      [PipelinePhase.SCRAPING]: { status: PhaseStatus.COMPLETED },
      [PipelinePhase.RESEARCH]: { status: phaseStatus },
      [PipelinePhase.EVALUATION]: { status: PhaseStatus.PENDING },
      [PipelinePhase.SYNTHESIS]: { status: PhaseStatus.PENDING },
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
    ...overrides,
  };
}

describe("runPipelinePhase", () => {
  let pipelineState: jest.Mocked<PipelineStateService>;
  let pipelineService: jest.Mocked<PipelineService>;
  let notificationGateway: jest.Mocked<NotificationGateway>;
  let job: Job<{ startupId: string; pipelineRunId: string; userId: string }>;
  const researchResult: ResearchResult = {
    team: null,
    market: null,
    product: null,
    news: null,
    competitor: null,
    sources: [],
    errors: [],
  };

  beforeEach(() => {
    pipelineState = {
      get: jest.fn().mockResolvedValue(buildState()),
      updatePhase: jest.fn().mockResolvedValue(undefined),
      setPhaseResult: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<PipelineStateService>;

    pipelineService = {
      onPhaseCompleted: jest.fn().mockResolvedValue(undefined),
      onPhaseFailed: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<PipelineService>;

    notificationGateway = {
      sendJobStatus: jest.fn(),
    } as unknown as jest.Mocked<NotificationGateway>;

    job = {
      id: "job-1",
      data: {
        startupId: "startup-1",
        pipelineRunId: "run-1",
        userId: "user-1",
      },
    } as unknown as Job<{
      startupId: string;
      pipelineRunId: string;
      userId: string;
    }>;
  });

  it("no-ops when pipeline run id does not match current state", async () => {
    pipelineState.get.mockResolvedValueOnce(
      buildState({
        pipelineRunId: "run-2",
      }),
    );

    const result = await runPipelinePhase({
      job,
      phase: PipelinePhase.RESEARCH,
      jobType: "ai_research",
      pipelineState,
      pipelineService,
      notificationGateway,
      run: jest.fn().mockResolvedValue(researchResult),
    });

    expect(result.result).toBeNull();
    expect(pipelineState.updatePhase).not.toHaveBeenCalled();
    expect(pipelineService.onPhaseCompleted).not.toHaveBeenCalled();
  });

  it("no-ops when pipeline is not running", async () => {
    pipelineState.get.mockResolvedValueOnce(
      buildState({
        status: PipelineStatus.FAILED,
      }),
    );

    const result = await runPipelinePhase({
      job,
      phase: PipelinePhase.RESEARCH,
      jobType: "ai_research",
      pipelineState,
      pipelineService,
      notificationGateway,
      run: jest.fn().mockResolvedValue(researchResult),
    });

    expect(result.result).toBeNull();
    expect(pipelineState.updatePhase).not.toHaveBeenCalled();
  });

  it("no-ops when phase is already terminal", async () => {
    const terminalResult: ResearchResult = {
      team: null,
      market: null,
      product: null,
      news: null,
      competitor: null,
      sources: [],
      errors: [],
    };
    pipelineState.get.mockResolvedValueOnce(
      buildState(
        {
          results: {
            [PipelinePhase.RESEARCH]: terminalResult,
          },
        },
        PhaseStatus.COMPLETED,
      ),
    );

    const result = await runPipelinePhase({
      job,
      phase: PipelinePhase.RESEARCH,
      jobType: "ai_research",
      pipelineState,
      pipelineService,
      notificationGateway,
      run: jest.fn().mockResolvedValue(researchResult),
    });

    expect(result.result).toEqual(terminalResult);
    expect(pipelineState.updatePhase).not.toHaveBeenCalled();
  });

  it("runs and writes state when run id and status are valid", async () => {
    const phaseResult: ResearchResult = {
      team: null,
      market: null,
      product: null,
      news: null,
      competitor: null,
      sources: [],
      errors: [],
    };

    const result = await runPipelinePhase({
      job,
      phase: PipelinePhase.RESEARCH,
      jobType: "ai_research",
      pipelineState,
      pipelineService,
      notificationGateway,
      run: jest.fn().mockResolvedValue(phaseResult),
    });

    expect(result.result).toEqual(phaseResult);
    expect(pipelineState.updatePhase).toHaveBeenCalledWith(
      "startup-1",
      PipelinePhase.RESEARCH,
      PhaseStatus.RUNNING,
    );
    expect(pipelineState.setPhaseResult).toHaveBeenCalledWith(
      "startup-1",
      PipelinePhase.RESEARCH,
      phaseResult,
    );
    expect(pipelineService.onPhaseCompleted).toHaveBeenCalledWith(
      "startup-1",
      PipelinePhase.RESEARCH,
    );
  });
});
