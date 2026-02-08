import { beforeEach, describe, expect, it, jest } from "bun:test";
import { ConfigService } from "@nestjs/config";
import type { Job } from "bullmq";
import { ResearchProcessor } from "../../processors/research.processor";
import { PipelinePhase, PhaseStatus } from "../../interfaces/pipeline.interface";
import type { PipelineStateService } from "../../services/pipeline-state.service";
import type { PipelineService } from "../../services/pipeline.service";
import type { ResearchService } from "../../services/research.service";
import type { NotificationGateway } from "../../../../notification/notification.gateway";
import type { AiResearchJobData } from "../../../../queue/interfaces";

describe("ResearchProcessor", () => {
  let processor: ResearchProcessor;
  let config: jest.Mocked<ConfigService>;
  let researchService: jest.Mocked<ResearchService>;
  let pipelineState: jest.Mocked<PipelineStateService>;
  let pipelineService: jest.Mocked<PipelineService>;
  let notificationGateway: jest.Mocked<NotificationGateway>;

  beforeEach(() => {
    config = {
      get: jest.fn((key: string, fallback?: unknown) => {
        if (key === "REDIS_URL") {
          return "redis://localhost:6379";
        }
        return fallback;
      }),
    } as unknown as jest.Mocked<ConfigService>;

    researchService = {
      run: jest.fn().mockResolvedValue({
        team: null,
        market: null,
        product: null,
        news: null,
        sources: [],
        errors: [],
      }),
    } as unknown as jest.Mocked<ResearchService>;

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

    processor = new ResearchProcessor(
      config as unknown as ConfigService,
      researchService as unknown as ResearchService,
      pipelineState as unknown as PipelineStateService,
      pipelineService as unknown as PipelineService,
      notificationGateway as unknown as NotificationGateway,
    );
  });

  it("processes research job lifecycle and stores result", async () => {
    const job = {
      id: "job-1",
      data: {
        type: "ai_research",
        startupId: "startup-1",
        pipelineRunId: "run-1",
        userId: "user-1",
      } satisfies AiResearchJobData,
    } as unknown as Job<AiResearchJobData>;

    const result = await (processor as any).process(job);

    expect(pipelineState.updatePhase).toHaveBeenCalledWith(
      "startup-1",
      PipelinePhase.RESEARCH,
      PhaseStatus.RUNNING,
    );
    expect(researchService.run).toHaveBeenCalledWith("startup-1");
    expect(pipelineState.setPhaseResult).toHaveBeenCalledWith(
      "startup-1",
      PipelinePhase.RESEARCH,
      expect.any(Object),
    );
    expect(pipelineService.onPhaseCompleted).toHaveBeenCalledWith(
      "startup-1",
      PipelinePhase.RESEARCH,
    );
    expect(notificationGateway.sendJobStatus).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({
        jobType: "ai_research",
        status: "processing",
      }),
    );
    expect(notificationGateway.sendJobStatus).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({
        jobType: "ai_research",
        status: "completed",
      }),
    );
    expect(result.type).toBe("ai_research");
  });

  it("marks phase failed when research run throws", async () => {
    researchService.run.mockRejectedValueOnce(new Error("provider unavailable"));

    const job = {
      id: "job-1",
      data: {
        type: "ai_research",
        startupId: "startup-1",
        pipelineRunId: "run-1",
        userId: "user-1",
      } satisfies AiResearchJobData,
    } as unknown as Job<AiResearchJobData>;

    await expect((processor as any).process(job)).rejects.toThrow(
      "provider unavailable",
    );
    expect(pipelineState.updatePhase).toHaveBeenCalledWith(
      "startup-1",
      PipelinePhase.RESEARCH,
      PhaseStatus.FAILED,
      "provider unavailable",
    );
    expect(pipelineService.onPhaseFailed).toHaveBeenCalledWith(
      "startup-1",
      PipelinePhase.RESEARCH,
      "provider unavailable",
    );
    expect(notificationGateway.sendJobStatus).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({
        jobType: "ai_research",
        status: "failed",
        error: "provider unavailable",
      }),
    );
  });
});
