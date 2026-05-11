import { afterEach, beforeEach, describe, expect, it, jest } from "bun:test";
import { Test, TestingModule } from "@nestjs/testing";
import { TaskProcessor } from "../../../queue/processors/task.processor";
import { NotificationGateway } from "../../../notification/notification.gateway";
import { CalibrationRecomputeProcessor } from "../calibration-recompute.processor";
import { CalibrationRecomputeService } from "../calibration-recompute.service";
import { CALIBRATION_RECOMPUTE_JOB } from "../calibration-recompute.constants";

const INVESTOR_ID = "22222222-2222-4222-8222-222222222222";

describe("CalibrationRecomputeProcessor", () => {
  let processor: CalibrationRecomputeProcessor;
  let taskProcessorMock: { registerHandler: jest.Mock };
  let recomputeServiceMock: { runJob: jest.Mock };
  let notificationsMock: { sendInvestorEvent: jest.Mock };

  beforeEach(async () => {
    taskProcessorMock = { registerHandler: jest.fn() };
    recomputeServiceMock = { runJob: jest.fn() };
    notificationsMock = { sendInvestorEvent: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CalibrationRecomputeProcessor,
        { provide: TaskProcessor, useValue: taskProcessorMock },
        { provide: CalibrationRecomputeService, useValue: recomputeServiceMock },
        { provide: NotificationGateway, useValue: notificationsMock },
      ],
    }).compile();

    processor = module.get(CalibrationRecomputeProcessor);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("registers a TASK handler on init", () => {
    processor.onModuleInit();
    expect(taskProcessorMock.registerHandler).toHaveBeenCalledTimes(1);
    expect(taskProcessorMock.registerHandler.mock.calls[0][0]).toBe(
      CALIBRATION_RECOMPUTE_JOB,
    );
  });

  it("runs the recompute and emits completed WS event", async () => {
    const computedAt = new Date("2026-05-01T12:00:00Z");
    recomputeServiceMock.runJob.mockResolvedValueOnce({
      summary: {
        totalDecisions: 4,
        decisionsWithTriage: 3,
        aligned: 1,
        falsePositive: 1,
        falseNegative: 1,
        softMismatch: 0,
        alignmentRate: 1 / 3,
        topOverrideReasons: [],
        recentMismatches: [],
      },
      computedAt,
    });

    const result = await processor.handle({
      id: "job-77",
      data: {
        type: "task",
        userId: INVESTOR_ID,
        name: CALIBRATION_RECOMPUTE_JOB,
        payload: { investorId: INVESTOR_ID },
      },
    } as never);

    expect(recomputeServiceMock.runJob).toHaveBeenCalledWith(INVESTOR_ID, "job-77");
    expect(notificationsMock.sendInvestorEvent).toHaveBeenCalledWith(
      INVESTOR_ID,
      "investor.calibration.recompute.completed",
      expect.objectContaining({
        investorId: INVESTOR_ID,
        jobId: "job-77",
        computedAt: computedAt.toISOString(),
      }),
    );
    expect(result.type).toBe("task");
    expect((result.result as Record<string, unknown>).computedAt).toBe(
      computedAt.toISOString(),
    );
  });

  it("emits a failed WS event and rethrows when recompute throws", async () => {
    recomputeServiceMock.runJob.mockRejectedValueOnce(new Error("DB exploded"));

    await expect(
      processor.handle({
        id: "job-88",
        data: {
          type: "task",
          userId: INVESTOR_ID,
          name: CALIBRATION_RECOMPUTE_JOB,
          payload: { investorId: INVESTOR_ID },
        },
      } as never),
    ).rejects.toThrow("DB exploded");

    expect(notificationsMock.sendInvestorEvent).toHaveBeenCalledWith(
      INVESTOR_ID,
      "investor.calibration.recompute.failed",
      expect.objectContaining({
        investorId: INVESTOR_ID,
        jobId: "job-88",
        error: "DB exploded",
      }),
    );
  });

  it("throws on invalid payload missing investorId", async () => {
    await expect(
      processor.handle({
        id: "job-99",
        data: {
          type: "task",
          userId: INVESTOR_ID,
          name: CALIBRATION_RECOMPUTE_JOB,
          payload: {},
        },
      } as never),
    ).rejects.toThrow(/missing investorId/);
  });
});
