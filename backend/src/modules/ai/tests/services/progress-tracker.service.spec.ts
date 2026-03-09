import { beforeEach, describe, expect, it, jest } from "bun:test";
import type { Logger } from "@nestjs/common";
import { DrizzleService } from "../../../../database";
import { NotificationGateway } from "../../../../notification/notification.gateway";
import {
  PhaseStatus,
  PipelinePhase,
  PipelineStatus,
} from "../../interfaces/pipeline.interface";
import { ProgressTrackerService } from "../../orchestrator/progress-tracker.service";

describe("ProgressTrackerService", () => {
  let service: ProgressTrackerService;
  let drizzle: jest.Mocked<DrizzleService>;
  let notifications: jest.Mocked<NotificationGateway>;
  let storedProgress: Record<string, unknown> | null;

  beforeEach(() => {
    storedProgress = null;

    const mockDb = {
      select: jest.fn(() => ({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockImplementation(async () => {
              if (!storedProgress) {
                return [];
              }
              return [
                {
                  analysisProgress: storedProgress,
                },
              ];
            }),
          }),
        }),
      })),
      insert: jest.fn(() => ({
        values: jest.fn(() => ({
          onConflictDoUpdate: jest.fn().mockImplementation(({ set }) => {
            storedProgress = set.analysisProgress as Record<string, unknown>;
            return {
              returning: jest.fn(async () => [{ startupId: "startup-1" }]),
            };
          }),
        })),
      })),
    };

    drizzle = { db: mockDb as any } as jest.Mocked<DrizzleService>;
    notifications = {
      sendPipelineEvent: jest.fn(),
    } as unknown as jest.Mocked<NotificationGateway>;

    service = new ProgressTrackerService(drizzle, notifications);
  });

  it("initializes analysis progress and emits pipeline:started", async () => {
    const progress = await service.initProgress({
      startupId: "startup-1",
      userId: "user-1",
      pipelineRunId: "run-1",
      phases: Object.values(PipelinePhase),
    });

    expect(progress.status).toBe(PipelineStatus.RUNNING);
    expect(progress.overallProgress).toBe(0);
    expect(progress.phases.extraction.status).toBe(PhaseStatus.PENDING);
    expect(notifications.sendPipelineEvent).toHaveBeenCalledWith(
      "user-1",
      "pipeline:started",
      expect.objectContaining({
        startupId: "startup-1",
        pipelineRunId: "run-1",
      }),
    );
  });

  it("seeds initial phase statuses for manual reruns", async () => {
    const progress = await service.initProgress({
      startupId: "startup-1",
      userId: "user-1",
      pipelineRunId: "run-rerun-1",
      phases: Object.values(PipelinePhase),
      currentPhase: PipelinePhase.EVALUATION,
      initialPhaseStatuses: {
        [PipelinePhase.ENRICHMENT]: PhaseStatus.COMPLETED,
        [PipelinePhase.EXTRACTION]: PhaseStatus.COMPLETED,
        [PipelinePhase.SCRAPING]: PhaseStatus.COMPLETED,
        [PipelinePhase.RESEARCH]: PhaseStatus.COMPLETED,
        [PipelinePhase.EVALUATION]: PhaseStatus.PENDING,
        [PipelinePhase.SYNTHESIS]: PhaseStatus.PENDING,
      },
    });

    expect(progress.currentPhase).toBe(PipelinePhase.EVALUATION);
    expect(progress.phases.enrichment.status).toBe(PhaseStatus.COMPLETED);
    expect(progress.phases.extraction.status).toBe(PhaseStatus.COMPLETED);
    expect(progress.phases.scraping.status).toBe(PhaseStatus.COMPLETED);
    expect(progress.phases.research.status).toBe(PhaseStatus.COMPLETED);
    expect(progress.phases.evaluation.status).toBe(PhaseStatus.PENDING);
    expect(progress.phases.synthesis.status).toBe(PhaseStatus.PENDING);
    expect(progress.overallProgress).toBe(67);
  });

  it("updates phase progress and computes overall percentage", async () => {
    await service.initProgress({
      startupId: "startup-1",
      userId: "user-1",
      pipelineRunId: "run-1",
      phases: Object.values(PipelinePhase),
    });

    const running = await service.updatePhaseProgress({
      startupId: "startup-1",
      userId: "user-1",
      pipelineRunId: "run-1",
      phase: PipelinePhase.EXTRACTION,
      status: PhaseStatus.RUNNING,
    });
    expect(running.currentPhase).toBe(PipelinePhase.EXTRACTION);

    const completed = await service.updatePhaseProgress({
      startupId: "startup-1",
      userId: "user-1",
      pipelineRunId: "run-1",
      phase: PipelinePhase.EXTRACTION,
      status: PhaseStatus.COMPLETED,
    });

    expect(completed.phasesCompleted).toEqual([PipelinePhase.EXTRACTION]);
    const expectedProgress = Math.round(
      (1 / Object.values(PipelinePhase).length) * 100,
    );
    expect(completed.overallProgress).toBe(expectedProgress);
    expect(notifications.sendPipelineEvent).toHaveBeenCalledWith(
      "user-1",
      "phase:completed",
      expect.objectContaining({
        phase: PipelinePhase.EXTRACTION,
        status: PhaseStatus.COMPLETED,
      }),
    );
  });

  it("tracks per-agent progress and emits events", async () => {
    await service.initProgress({
      startupId: "startup-1",
      userId: "user-1",
      pipelineRunId: "run-1",
      phases: Object.values(PipelinePhase),
    });

    await service.updateAgentProgress({
      startupId: "startup-1",
      userId: "user-1",
      pipelineRunId: "run-1",
      phase: PipelinePhase.EVALUATION,
      key: "team",
      status: "running",
      progress: 50,
    });

    await service.updateAgentProgress({
      startupId: "startup-1",
      userId: "user-1",
      pipelineRunId: "run-1",
      phase: PipelinePhase.EVALUATION,
      key: "team",
      status: "completed",
      progress: 100,
    });

    expect(notifications.sendPipelineEvent).toHaveBeenCalledWith(
      "user-1",
      "agent:progress",
      expect.objectContaining({
        phase: PipelinePhase.EVALUATION,
      }),
    );
    expect(notifications.sendPipelineEvent).toHaveBeenCalledWith(
      "user-1",
      "agent:completed",
      expect.objectContaining({
        phase: PipelinePhase.EVALUATION,
      }),
    );
  });

  it("ignores stale running updates after an agent reaches a terminal state", async () => {
    await service.initProgress({
      startupId: "startup-1",
      userId: "user-1",
      pipelineRunId: "run-1",
      phases: Object.values(PipelinePhase),
    });

    await service.updateAgentProgress({
      startupId: "startup-1",
      userId: "user-1",
      pipelineRunId: "run-1",
      phase: PipelinePhase.EVALUATION,
      key: "traction",
      status: "failed",
      error: "No output generated.",
      attempt: 2,
      retryCount: 1,
      usedFallback: true,
      lifecycleEvent: "fallback",
    });

    await service.updateAgentProgress({
      startupId: "startup-1",
      userId: "user-1",
      pipelineRunId: "run-1",
      phase: PipelinePhase.EVALUATION,
      key: "traction",
      status: "running",
      progress: 0,
      error: "No output generated.",
      attempt: 1,
      retryCount: 1,
      lifecycleEvent: "retrying",
    });

    const progress = await service.getProgress("startup-1");
    const traction = progress?.phases.evaluation.agents.traction;

    expect(traction?.status).toBe("failed");
    expect(traction?.lastEvent).toBe("fallback");
    expect(traction?.attempts).toBe(2);
    expect(traction?.retryCount).toBe(1);
  });

  it("stores phase failure error and emits phase:failed", async () => {
    await service.initProgress({
      startupId: "startup-1",
      userId: "user-1",
      pipelineRunId: "run-1",
      phases: Object.values(PipelinePhase),
    });

    const failed = await service.updatePhaseProgress({
      startupId: "startup-1",
      userId: "user-1",
      pipelineRunId: "run-1",
      phase: PipelinePhase.RESEARCH,
      status: PhaseStatus.FAILED,
      error: "timeout",
    });

    expect(failed.phases.research.error).toBe("timeout");
    expect(notifications.sendPipelineEvent).toHaveBeenCalledWith(
      "user-1",
      "phase:failed",
      expect.objectContaining({
        phase: PipelinePhase.RESEARCH,
        status: PhaseStatus.FAILED,
        error: "timeout",
      }),
    );
  });

  it("deduplicates repeated lifecycle events for the same agent attempt", async () => {
    await service.initProgress({
      startupId: "startup-1",
      userId: "user-1",
      pipelineRunId: "run-1",
      phases: Object.values(PipelinePhase),
    });

    await service.updateAgentProgress({
      startupId: "startup-1",
      userId: "user-1",
      pipelineRunId: "run-1",
      phase: PipelinePhase.RESEARCH,
      key: "team",
      status: "running",
      progress: 0,
      attempt: 1,
      retryCount: 0,
      lifecycleEvent: "started",
    });

    await service.updateAgentProgress({
      startupId: "startup-1",
      userId: "user-1",
      pipelineRunId: "run-1",
      phase: PipelinePhase.RESEARCH,
      key: "team",
      status: "running",
      progress: 0,
      attempt: 1,
      retryCount: 0,
      lifecycleEvent: "started",
    });

    const progress = await service.getProgress("startup-1");
    expect(progress?.agentEvents).toHaveLength(1);
  });

  it("marks progress as complete and emits pipeline:completed", async () => {
    await service.initProgress({
      startupId: "startup-1",
      userId: "user-1",
      pipelineRunId: "run-1",
      phases: Object.values(PipelinePhase),
    });

    const completed = await service.setPipelineStatus({
      startupId: "startup-1",
      userId: "user-1",
      pipelineRunId: "run-1",
      status: PipelineStatus.COMPLETED,
      currentPhase: PipelinePhase.SYNTHESIS,
      overallScore: 91,
    });

    expect(completed.status).toBe(PipelineStatus.COMPLETED);
    expect(completed.overallProgress).toBe(100);
    expect(notifications.sendPipelineEvent).toHaveBeenCalledWith(
      "user-1",
      "pipeline:completed",
      expect.objectContaining({
        startupId: "startup-1",
        overallScore: 91,
      }),
    );
  });

  it("treats completed runs with warnings as warnings, not hard failures", async () => {
    await service.initProgress({
      startupId: "startup-1",
      userId: "user-1",
      pipelineRunId: "run-1",
      phases: Object.values(PipelinePhase),
    });
    const loggerWarnSpy = jest.spyOn((service as unknown as { logger: Logger }).logger, "warn");
    const loggerErrorSpy = jest.spyOn((service as unknown as { logger: Logger }).logger, "error");

    const completed = await service.setPipelineStatus({
      startupId: "startup-1",
      userId: "user-1",
      pipelineRunId: "run-1",
      status: PipelineStatus.COMPLETED,
      currentPhase: PipelinePhase.SYNTHESIS,
      error: "Manual diligence still required.",
      overallScore: 73.5,
    });

    expect(completed.status).toBe(PipelineStatus.COMPLETED);
    expect(completed.error).toBe("Manual diligence still required.");
    expect(loggerWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining("PIPELINE COMPLETED WITH WARNINGS"),
    );
    expect(loggerErrorSpy).not.toHaveBeenCalledWith(
      expect.stringContaining("PIPELINE FAILED"),
    );
  });

  it("returns null for corrupted analysisProgress payload", async () => {
    storedProgress = { invalid: "structure", status: 123 };

    const result = await service.getProgress("startup-1");

    expect(result).toBeNull();
  });

  it("normalizes analysisProgress when enum-like fields are invalid", async () => {
    storedProgress = {
      pipelineRunId: "run-1",
      startupId: "startup-1",
      status: "INVALID_STATUS",
      currentPhase: PipelinePhase.EXTRACTION,
      overallProgress: 50,
      phasesCompleted: [],
      phases: {},
      updatedAt: new Date().toISOString(),
    };

    const result = await service.getProgress("startup-1");

    expect(result).not.toBeNull();
    expect(result?.status).toBe(PipelineStatus.RUNNING);
    expect(result?.currentPhase).toBe(PipelinePhase.EXTRACTION);
  });

  it("returns null when analysisProgress is missing required fields", async () => {
    storedProgress = { pipelineRunId: "run-1" };

    const result = await service.getProgress("startup-1");

    expect(result).toBeNull();
  });

  it("normalizes legacy stage-based analysis progress payloads", async () => {
    storedProgress = {
      currentStage: 4,
      currentStageLabel: "AI evaluation",
      completedAgents: ["web", "deck", "team"],
      currentAgent: "market",
      startedAt: "2026-02-14T00:00:00.000Z",
      lastUpdatedAt: "2026-02-14T00:05:00.000Z",
      stageProgress: [
        { stage: 1, status: "completed", startedAt: "2026-02-14T00:00:00.000Z", completedAt: "2026-02-14T00:01:00.000Z" },
        { stage: 2, status: "completed", startedAt: "2026-02-14T00:01:00.000Z", completedAt: "2026-02-14T00:02:00.000Z" },
        { stage: 3, status: "completed", startedAt: "2026-02-14T00:02:00.000Z", completedAt: "2026-02-14T00:03:00.000Z" },
        { stage: 4, status: "running", startedAt: "2026-02-14T00:03:00.000Z" },
      ],
    };

    const result = await service.getProgress("startup-1");

    expect(result).not.toBeNull();
    expect(result?.startupId).toBe("startup-1");
    expect(result?.status).toBe(PipelineStatus.RUNNING);
    expect(result?.currentPhase).toBe(PipelinePhase.EVALUATION);
    expect(result?.phases.extraction.status).toBe(PhaseStatus.COMPLETED);
    expect(result?.phases.evaluation.status).toBe(PhaseStatus.RUNNING);
  });

  it("normalizes legacy phase-based payloads with agent maps", async () => {
    storedProgress = {
      overallProgress: 60,
      currentPhase: "evaluation",
      pipelineStatus: "running",
      phasesCompleted: ["extraction", "scraping", "research"],
      phases: {
        extraction: { status: "completed" },
        scraping: { status: "completed" },
        research: { status: "completed" },
        evaluation: {
          status: "running",
          agents: {
            team: { status: "completed", progress: 100 },
            market: { status: "running", progress: 50 },
          },
        },
      },
      updatedAt: "2026-02-14T00:05:00.000Z",
    };

    const result = await service.getProgress("startup-1");

    expect(result).not.toBeNull();
    expect(result?.currentPhase).toBe(PipelinePhase.EVALUATION);
    expect(result?.phases.evaluation.agents.team.status).toBe("completed");
    expect(result?.phases.evaluation.agents.market.progress).toBe(50);
  });

  it("normalizes minimal legacy payloads with missing required fields", async () => {
    storedProgress = {
      status: "INVALID_STATUS",
      currentPhase: "analysis",
      phasesCompleted: ["extraction", "research"],
      lastUpdatedAt: "2026-02-14T00:05:00.000Z",
    };

    const result = await service.getProgress("startup-1");

    expect(result).not.toBeNull();
    expect(result?.pipelineRunId).toBe("legacy-startup-1");
    expect(result?.startupId).toBe("startup-1");
    expect(result?.status).toBe(PipelineStatus.RUNNING);
    expect(result?.currentPhase).toBe(PipelinePhase.EVALUATION);
    expect(result?.phases.extraction.status).toBe(PhaseStatus.COMPLETED);
    expect(result?.phases.research.status).toBe(PhaseStatus.COMPLETED);
  });
});
