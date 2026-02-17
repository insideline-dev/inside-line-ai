import { beforeEach, describe, expect, it, jest } from "bun:test";
import { ConfigService } from "@nestjs/config";
import type { Job } from "bullmq";
import { EvaluationProcessor } from "../../processors/evaluation.processor";
import {
  PhaseStatus,
  PipelinePhase,
  PipelineStatus,
} from "../../interfaces/pipeline.interface";
import type { PipelineStateService } from "../../services/pipeline-state.service";
import type { PipelineService } from "../../services/pipeline.service";
import type { EvaluationService } from "../../services/evaluation.service";
import type { NotificationGateway } from "../../../../notification/notification.gateway";
import type { AiEvaluationJobData } from "../../../../queue/interfaces";

describe("EvaluationProcessor", () => {
  let processor: EvaluationProcessor;
  let config: jest.Mocked<ConfigService>;
  let evaluationService: jest.Mocked<EvaluationService>;
  let pipelineState: jest.Mocked<PipelineStateService>;
  let pipelineService: jest.Mocked<PipelineService>;
  let notificationGateway: jest.Mocked<NotificationGateway>;

  const evaluationResult = {
    team: { score: 80 },
    market: { score: 78 },
    product: { score: 82 },
    traction: { score: 69 },
    businessModel: { score: 74 },
    gtm: { score: 71 },
    financials: { score: 67 },
    competitiveAdvantage: { score: 76 },
    legal: { score: 73 },
    dealTerms: { score: 70 },
    exitPotential: { score: 75 },
    summary: {
      completedAgents: 11,
      failedAgents: 0,
      minimumRequired: 8,
      failedKeys: [],
      errors: [],
      degraded: false,
    },
  };

  beforeEach(() => {
    config = {
      get: jest.fn((key: string, fallback?: unknown) => {
        if (key === "REDIS_URL") {
          return "redis://localhost:6379";
        }
        return fallback;
      }),
    } as unknown as jest.Mocked<ConfigService>;

    evaluationService = {
      run: jest
        .fn()
        .mockImplementation(
          async (
            _startupId: string,
            options?: {
              onAgentStart?: (agent: string) => void;
              onAgentComplete?: (payload: {
                agent: string;
                output: unknown;
                usedFallback: boolean;
                error?: string;
              }) => void;
            },
          ) => {
            options?.onAgentStart?.("team");
            options?.onAgentComplete?.({
              agent: "team",
              output: { score: 80 },
              usedFallback: false,
            });

            return evaluationResult;
          },
        ),
    } as unknown as jest.Mocked<EvaluationService>;

    pipelineState = {
      get: jest.fn().mockResolvedValue({
        pipelineRunId: "run-1",
        startupId: "startup-1",
        userId: "user-1",
        status: PipelineStatus.RUNNING,
        quality: "standard",
        currentPhase: PipelinePhase.EVALUATION,
        phases: {
          [PipelinePhase.EXTRACTION]: { status: PhaseStatus.COMPLETED },
          [PipelinePhase.SCRAPING]: { status: PhaseStatus.COMPLETED },
          [PipelinePhase.RESEARCH]: { status: PhaseStatus.COMPLETED },
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
      }),
      updatePhase: jest.fn().mockResolvedValue(undefined),
      setPhaseResult: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<PipelineStateService>;

    pipelineService = {
      onPhaseCompleted: jest.fn().mockResolvedValue(undefined),
      onPhaseFailed: jest.fn().mockResolvedValue(undefined),
      onAgentProgress: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<PipelineService>;

    notificationGateway = {
      sendJobStatus: jest.fn(),
    } as unknown as jest.Mocked<NotificationGateway>;

    processor = new EvaluationProcessor(
      config as unknown as ConfigService,
      evaluationService as unknown as EvaluationService,
      pipelineState as unknown as PipelineStateService,
      pipelineService as unknown as PipelineService,
      notificationGateway as unknown as NotificationGateway,
    );
  });

  it("processes evaluation job lifecycle, emits per-agent progress, and stores result", async () => {
    const job = {
      id: "job-1",
      data: {
        type: "ai_evaluation",
        startupId: "startup-1",
        pipelineRunId: "run-1",
        userId: "user-1",
      } satisfies AiEvaluationJobData,
    } as unknown as Job<AiEvaluationJobData>;

    const result = await (processor as unknown as { process: (job: Job<AiEvaluationJobData>) => Promise<{ type: string }> }).process(job);

    expect(pipelineState.updatePhase).toHaveBeenCalledWith(
      "startup-1",
      PipelinePhase.EVALUATION,
      PhaseStatus.RUNNING,
    );
    expect(evaluationService.run).toHaveBeenCalledWith(
      "startup-1",
      expect.objectContaining({
        onAgentStart: expect.any(Function),
        onAgentComplete: expect.any(Function),
      }),
    );
    expect(notificationGateway.sendJobStatus).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({
        jobType: "ai_evaluation",
        status: "processing",
      }),
    );
    expect(notificationGateway.sendJobStatus).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({
        jobType: "ai_evaluation",
        status: "processing",
        result: expect.objectContaining({
          agent: "team",
          usedFallback: false,
        }),
      }),
    );
    expect(pipelineService.onAgentProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        startupId: "startup-1",
        phase: PipelinePhase.EVALUATION,
        key: "team",
        status: "running",
      }),
    );
    expect(pipelineService.onAgentProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        startupId: "startup-1",
        phase: PipelinePhase.EVALUATION,
        key: "team",
        status: "completed",
      }),
    );
    expect(pipelineState.setPhaseResult).toHaveBeenCalledWith(
      "startup-1",
      PipelinePhase.EVALUATION,
      expect.any(Object),
    );
    expect(pipelineState.updatePhase).toHaveBeenCalledWith(
      "startup-1",
      PipelinePhase.EVALUATION,
      PhaseStatus.COMPLETED,
    );
    expect(pipelineService.onPhaseCompleted).toHaveBeenCalledWith(
      "startup-1",
      PipelinePhase.EVALUATION,
    );
    expect(result.type).toBe("ai_evaluation");
  });

  it("marks fallback agent completions as completed in progress tracking", async () => {
    evaluationService.run.mockImplementationOnce(
      async (
        _startupId: string,
        options?: {
          onAgentComplete?: (payload: {
            agent: string;
            output: unknown;
            usedFallback: boolean;
            error?: string;
          }) => void;
        },
      ) => {
        options?.onAgentComplete?.({
          agent: "traction",
          output: { score: 20 },
          usedFallback: true,
          error: "No output generated.",
        });
        return {
          ...evaluationResult,
          summary: {
            ...evaluationResult.summary,
            failedAgents: 1,
            failedKeys: ["traction"],
            errors: [{ agent: "traction", error: "No output generated." }],
          },
        };
      },
    );

    const job = {
      id: "job-1",
      data: {
        type: "ai_evaluation",
        startupId: "startup-1",
        pipelineRunId: "run-1",
        userId: "user-1",
      } satisfies AiEvaluationJobData,
    } as unknown as Job<AiEvaluationJobData>;

    await (processor as unknown as { process: (job: Job<AiEvaluationJobData>) => Promise<{ type: string }> }).process(job);

    expect(pipelineService.onAgentProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        key: "traction",
        status: "completed",
        progress: 100,
        error: undefined,
      }),
    );
  });

  it("throws for invalid evaluation job type", async () => {
    const job = {
      id: "job-1",
      data: {
        type: "ai_research",
        startupId: "startup-1",
        pipelineRunId: "run-1",
        userId: "user-1",
      },
    } as unknown as Job<AiEvaluationJobData>;

    await expect(
      (processor as unknown as { process: (job: Job<AiEvaluationJobData>) => Promise<unknown> }).process(job),
    ).rejects.toThrow("Invalid job type for evaluation processor");
  });

  it("marks phase failed when evaluation run throws", async () => {
    evaluationService.run.mockRejectedValueOnce(new Error("provider unavailable"));

    const job = {
      id: "job-1",
      data: {
        type: "ai_evaluation",
        startupId: "startup-1",
        pipelineRunId: "run-1",
        userId: "user-1",
      } satisfies AiEvaluationJobData,
    } as unknown as Job<AiEvaluationJobData>;

    await expect(
      (processor as unknown as { process: (job: Job<AiEvaluationJobData>) => Promise<unknown> }).process(job),
    ).rejects.toThrow("provider unavailable");

    expect(pipelineState.updatePhase).toHaveBeenCalledWith(
      "startup-1",
      PipelinePhase.EVALUATION,
      PhaseStatus.FAILED,
      "provider unavailable",
    );
    expect(pipelineService.onPhaseFailed).toHaveBeenCalledWith(
      "startup-1",
      PipelinePhase.EVALUATION,
      "provider unavailable",
    );
    expect(notificationGateway.sendJobStatus).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({
        jobType: "ai_evaluation",
        status: "failed",
        error: "provider unavailable",
      }),
    );
  });
});
