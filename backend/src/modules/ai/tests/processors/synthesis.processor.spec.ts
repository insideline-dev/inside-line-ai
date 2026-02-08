import { beforeEach, describe, expect, it, jest } from "bun:test";
import { ConfigService } from "@nestjs/config";
import type { Job } from "bullmq";
import { SynthesisProcessor } from "../../processors/synthesis.processor";
import { PhaseStatus, PipelinePhase } from "../../interfaces/pipeline.interface";
import type { PipelineStateService } from "../../services/pipeline-state.service";
import type { PipelineService } from "../../services/pipeline.service";
import type { SynthesisService } from "../../services/synthesis.service";
import type { NotificationGateway } from "../../../../notification/notification.gateway";
import type { AiSynthesisJobData } from "../../../../queue/interfaces";
import { createMockSynthesisResult } from "../fixtures/mock-synthesis.fixture";

describe("SynthesisProcessor", () => {
  let processor: SynthesisProcessor;
  let config: jest.Mocked<ConfigService>;
  let synthesisService: jest.Mocked<SynthesisService>;
  let pipelineState: jest.Mocked<PipelineStateService>;
  let pipelineService: jest.Mocked<PipelineService>;
  let notificationGateway: jest.Mocked<NotificationGateway>;

  beforeEach(() => {
    config = {
      get: jest.fn((key: string, fallback?: unknown) => {
        if (key === "REDIS_URL") return "redis://localhost:6379";
        return fallback;
      }),
    } as unknown as jest.Mocked<ConfigService>;

    synthesisService = {
      run: jest.fn().mockResolvedValue(createMockSynthesisResult()),
    } as unknown as jest.Mocked<SynthesisService>;

    pipelineState = {
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

    processor = new SynthesisProcessor(
      config as unknown as ConfigService,
      synthesisService as unknown as SynthesisService,
      pipelineState as unknown as PipelineStateService,
      pipelineService as unknown as PipelineService,
      notificationGateway as unknown as NotificationGateway,
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
    expect(synthesisService.run).toHaveBeenCalledWith("startup-1");
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
    synthesisService.run.mockRejectedValueOnce(new Error("synthesis failed"));

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
  });
});
