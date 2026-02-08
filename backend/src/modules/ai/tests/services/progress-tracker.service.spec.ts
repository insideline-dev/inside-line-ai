import { beforeEach, describe, expect, it, jest } from "bun:test";
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
      phases: [
        PipelinePhase.EXTRACTION,
        PipelinePhase.SCRAPING,
        PipelinePhase.RESEARCH,
        PipelinePhase.EVALUATION,
        PipelinePhase.SYNTHESIS,
      ],
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
    expect(completed.overallProgress).toBe(20);
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

  it("returns null for corrupted analysisProgress payload", async () => {
    storedProgress = { invalid: "structure", status: 123 };

    const result = await service.getProgress("startup-1");

    expect(result).toBeNull();
  });

  it("returns null when analysisProgress has invalid enum values", async () => {
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

    expect(result).toBeNull();
  });

  it("returns null when analysisProgress is missing required fields", async () => {
    storedProgress = { pipelineRunId: "run-1" };

    const result = await service.getProgress("startup-1");

    expect(result).toBeNull();
  });
});
