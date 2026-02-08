import { beforeEach, describe, expect, it, jest } from "bun:test";
import { DrizzleService } from "../../../../database";
import { PipelinePhase } from "../../interfaces/pipeline.interface";
import { ErrorRecoveryService } from "../../orchestrator/error-recovery.service";

describe("ErrorRecoveryService", () => {
  let service: ErrorRecoveryService;
  let drizzle: jest.Mocked<DrizzleService>;

  const mockDb = {
    insert: jest.fn().mockReturnThis(),
    values: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(() => {
    drizzle = { db: mockDb as any } as jest.Mocked<DrizzleService>;
    service = new ErrorRecoveryService(drizzle);
  });

  it("computes retry delay for each backoff mode", () => {
    expect(
      service.getRetryDelayMs(
        { maxRetries: 3, backoff: "exponential", initialDelayMs: 1000 },
        3,
      ),
    ).toBe(4000);

    expect(
      service.getRetryDelayMs(
        { maxRetries: 3, backoff: "linear", initialDelayMs: 1000 },
        3,
      ),
    ).toBe(3000);

    expect(
      service.getRetryDelayMs(
        { maxRetries: 3, backoff: "fixed", initialDelayMs: 1000 },
        3,
      ),
    ).toBe(1000);
  });

  it("schedules and clears phase timeout handlers", async () => {
    let calls = 0;
    service.schedulePhaseTimeout({
      startupId: "startup-1",
      phase: PipelinePhase.RESEARCH,
      timeoutMs: 10,
      onTimeout: () => {
        calls += 1;
      },
    });
    service.clearPhaseTimeout("startup-1", PipelinePhase.RESEARCH);

    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(calls).toBe(0);
  });

  it("clears all phase timeout handlers for a startup", async () => {
    let startupOneCalls = 0;
    let startupTwoCalls = 0;

    service.schedulePhaseTimeout({
      startupId: "startup-1",
      phase: PipelinePhase.EXTRACTION,
      timeoutMs: 10,
      onTimeout: () => {
        startupOneCalls += 1;
      },
    });
    service.schedulePhaseTimeout({
      startupId: "startup-1",
      phase: PipelinePhase.RESEARCH,
      timeoutMs: 10,
      onTimeout: () => {
        startupOneCalls += 1;
      },
    });
    service.schedulePhaseTimeout({
      startupId: "startup-2",
      phase: PipelinePhase.EXTRACTION,
      timeoutMs: 10,
      onTimeout: () => {
        startupTwoCalls += 1;
      },
    });

    service.clearAllTimeoutsForStartup("startup-1");
    await new Promise((resolve) => setTimeout(resolve, 30));

    expect(startupOneCalls).toBe(0);
    expect(startupTwoCalls).toBe(1);
  });

  it("records pipeline failure rows", async () => {
    await service.recordFailure({
      pipelineRunId: "run-1",
      startupId: "startup-1",
      phase: PipelinePhase.EVALUATION,
      retryCount: 2,
      error: {
        message: "evaluation failed",
      },
      jobData: {
        type: "ai_evaluation",
      },
    });

    expect(mockDb.insert).toHaveBeenCalledTimes(1);
    expect(mockDb.values).toHaveBeenCalledWith(
      expect.objectContaining({
        pipelineRunId: "run-1",
        phase: PipelinePhase.EVALUATION,
        retryCount: 2,
      }),
    );
  });

  it("cleans up registered timers on module destroy", async () => {
    let calls = 0;
    service.schedulePhaseTimeout({
      startupId: "startup-1",
      phase: PipelinePhase.EVALUATION,
      timeoutMs: 10,
      onTimeout: () => {
        calls += 1;
      },
    });

    await service.onModuleDestroy();
    await new Promise((resolve) => setTimeout(resolve, 30));

    expect(calls).toBe(0);
  });
});
