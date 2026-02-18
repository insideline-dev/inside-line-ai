import { beforeEach, describe, expect, it, jest } from "bun:test";
import { ConfigService } from "@nestjs/config";
import type { Job } from "bullmq";
import { SynthesisProcessor } from "../../processors/synthesis.processor";
import {
  PhaseStatus,
  PipelinePhase,
  PipelineStatus,
} from "../../interfaces/pipeline.interface";
import type { PipelineStateService } from "../../services/pipeline-state.service";
import type { PipelineService } from "../../services/pipeline.service";
import type { PipelineAgentTraceService } from "../../services/pipeline-agent-trace.service";
import type { SynthesisService } from "../../services/synthesis.service";
import type { NotificationGateway } from "../../../../notification/notification.gateway";
import type { AiSynthesisJobData } from "../../../../queue/interfaces";
import { createMockSynthesisResult } from "../fixtures/mock-synthesis.fixture";
import { SYNTHESIS_AGENT_KEY } from "../../services/synthesis.service";

describe("SynthesisProcessor", () => {
  let processor: SynthesisProcessor;
  let config: jest.Mocked<ConfigService>;
  let synthesisService: jest.Mocked<SynthesisService>;
  let pipelineState: jest.Mocked<PipelineStateService>;
  let pipelineService: jest.Mocked<PipelineService>;
  let notificationGateway: jest.Mocked<NotificationGateway>;
  let pipelineAgentTrace: jest.Mocked<PipelineAgentTraceService>;

  beforeEach(() => {
    config = {
      get: jest.fn((key: string, fallback?: unknown) => {
        if (key === "REDIS_URL") return "redis://localhost:6379";
        return fallback;
      }),
    } as unknown as jest.Mocked<ConfigService>;

    synthesisService = {
      runDetailed: jest.fn().mockResolvedValue({
        synthesis: createMockSynthesisResult(),
        trace: {
          agentKey: SYNTHESIS_AGENT_KEY,
          status: "completed",
          attempt: 1,
          retryCount: 0,
          usedFallback: false,
          inputPrompt: "Synthesis prompt",
          outputText: JSON.stringify(createMockSynthesisResult()),
          outputJson: createMockSynthesisResult(),
        },
      }),
    } as unknown as jest.Mocked<SynthesisService>;

    pipelineState = {
      get: jest.fn().mockResolvedValue({
        pipelineRunId: "run-1",
        startupId: "startup-1",
        userId: "user-1",
        status: PipelineStatus.RUNNING,
        quality: "standard",
        currentPhase: PipelinePhase.SYNTHESIS,
        phases: {
          [PipelinePhase.EXTRACTION]: { status: PhaseStatus.COMPLETED },
          [PipelinePhase.SCRAPING]: { status: PhaseStatus.COMPLETED },
          [PipelinePhase.RESEARCH]: { status: PhaseStatus.COMPLETED },
          [PipelinePhase.EVALUATION]: { status: PhaseStatus.COMPLETED },
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

    pipelineAgentTrace = {
      recordRun: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<PipelineAgentTraceService>;

    processor = new SynthesisProcessor(
      config as unknown as ConfigService,
      synthesisService as unknown as SynthesisService,
      pipelineState as unknown as PipelineStateService,
      pipelineService as unknown as PipelineService,
      notificationGateway as unknown as NotificationGateway,
      pipelineAgentTrace as unknown as PipelineAgentTraceService,
    );
  });

  it("processes synthesis job lifecycle and stores result", async () => {
    const job = {
      id: "job-1",
      data: {
        type: "ai_synthesis",
        startupId: "startup-1",
        pipelineRunId: "run-1",
        userId: "user-1",
      } satisfies AiSynthesisJobData,
    } as unknown as Job<AiSynthesisJobData>;

    const result = await (
      processor as unknown as {
        process: (job: Job<AiSynthesisJobData>) => Promise<{ type: string }>;
      }
    ).process(job);

    expect(pipelineState.updatePhase).toHaveBeenCalledWith(
      "startup-1",
      PipelinePhase.SYNTHESIS,
      PhaseStatus.RUNNING,
    );
    expect(synthesisService.runDetailed).toHaveBeenCalledWith("startup-1");
    expect(pipelineService.onAgentProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        startupId: "startup-1",
        pipelineRunId: "run-1",
        phase: PipelinePhase.SYNTHESIS,
        key: SYNTHESIS_AGENT_KEY,
        status: "running",
        lifecycleEvent: "started",
      }),
    );
    expect(pipelineService.onAgentProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        startupId: "startup-1",
        pipelineRunId: "run-1",
        phase: PipelinePhase.SYNTHESIS,
        key: SYNTHESIS_AGENT_KEY,
        status: "completed",
        lifecycleEvent: "completed",
      }),
    );
    expect(pipelineAgentTrace.recordRun).toHaveBeenCalledWith(
      expect.objectContaining({
        startupId: "startup-1",
        pipelineRunId: "run-1",
        phase: PipelinePhase.SYNTHESIS,
        agentKey: SYNTHESIS_AGENT_KEY,
        status: "completed",
      }),
    );
    expect(pipelineState.setPhaseResult).toHaveBeenCalledWith(
      "startup-1",
      PipelinePhase.SYNTHESIS,
      expect.any(Object),
    );
    expect(pipelineService.onPhaseCompleted).toHaveBeenCalledWith(
      "startup-1",
      PipelinePhase.SYNTHESIS,
    );
    expect(notificationGateway.sendJobStatus).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({ status: "completed", jobType: "ai_synthesis" }),
    );
    expect(result.type).toBe("ai_synthesis");
  });

  it("marks phase failed when synthesis service throws", async () => {
    synthesisService.runDetailed.mockRejectedValueOnce(
      new Error("synthesis failed"),
    );

    const job = {
      id: "job-1",
      data: {
        type: "ai_synthesis",
        startupId: "startup-1",
        pipelineRunId: "run-1",
        userId: "user-1",
      } satisfies AiSynthesisJobData,
    } as unknown as Job<AiSynthesisJobData>;

    await expect(
      (
        processor as unknown as {
          process: (job: Job<AiSynthesisJobData>) => Promise<unknown>;
        }
      ).process(job),
    ).rejects.toThrow("synthesis failed");

    expect(pipelineState.updatePhase).toHaveBeenCalledWith(
      "startup-1",
      PipelinePhase.SYNTHESIS,
      PhaseStatus.FAILED,
      "synthesis failed",
    );
    expect(pipelineService.onPhaseFailed).toHaveBeenCalledWith(
      "startup-1",
      PipelinePhase.SYNTHESIS,
      "synthesis failed",
    );
    expect(pipelineService.onAgentProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        startupId: "startup-1",
        pipelineRunId: "run-1",
        phase: PipelinePhase.SYNTHESIS,
        key: SYNTHESIS_AGENT_KEY,
        status: "failed",
        lifecycleEvent: "failed",
        error: "synthesis failed",
      }),
    );
    expect(pipelineAgentTrace.recordRun).toHaveBeenCalledWith(
      expect.objectContaining({
        startupId: "startup-1",
        pipelineRunId: "run-1",
        phase: PipelinePhase.SYNTHESIS,
        agentKey: SYNTHESIS_AGENT_KEY,
        status: "failed",
        error: "synthesis failed",
      }),
    );
  });

  it("marks lifecycle as fallback when synthesis returns fallback output", async () => {
    synthesisService.runDetailed.mockResolvedValueOnce({
      synthesis: createMockSynthesisResult(),
      trace: {
        agentKey: SYNTHESIS_AGENT_KEY,
        status: "fallback",
        attempt: 1,
        retryCount: 0,
        usedFallback: true,
        inputPrompt: "Synthesis prompt",
        outputText: "fallback output",
        outputJson: { overallScore: 0 },
        error: "Model returned empty structured output; fallback result generated.",
        fallbackReason: "EMPTY_STRUCTURED_OUTPUT",
        rawProviderError: "No object generated",
      },
    });

    const job = {
      id: "job-1",
      data: {
        type: "ai_synthesis",
        startupId: "startup-1",
        pipelineRunId: "run-1",
        userId: "user-1",
      } satisfies AiSynthesisJobData,
    } as unknown as Job<AiSynthesisJobData>;

    await (
      processor as unknown as {
        process: (job: Job<AiSynthesisJobData>) => Promise<{ type: string }>;
      }
    ).process(job);

    expect(pipelineService.onAgentProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        startupId: "startup-1",
        pipelineRunId: "run-1",
        phase: PipelinePhase.SYNTHESIS,
        key: SYNTHESIS_AGENT_KEY,
        status: "completed",
        lifecycleEvent: "fallback",
        usedFallback: true,
      }),
    );
    expect(pipelineAgentTrace.recordRun).toHaveBeenCalledWith(
      expect.objectContaining({
        startupId: "startup-1",
        pipelineRunId: "run-1",
        phase: PipelinePhase.SYNTHESIS,
        agentKey: SYNTHESIS_AGENT_KEY,
        status: "fallback",
        usedFallback: true,
      }),
    );
  });
});
