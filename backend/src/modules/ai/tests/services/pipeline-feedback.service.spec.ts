import { beforeEach, describe, expect, it, jest } from "bun:test";
import { DrizzleService } from "../../../../database";
import { PipelinePhase } from "../../interfaces/pipeline.interface";
import { PipelineFeedbackService } from "../../services/pipeline-feedback.service";

describe("PipelineFeedbackService", () => {
  let service: PipelineFeedbackService;
  let drizzle: jest.Mocked<DrizzleService>;

  const createMockDb = () => ({
    insert: jest.fn().mockReturnThis(),
    values: jest.fn().mockReturnThis(),
    returning: jest.fn(),
    select: jest.fn().mockReturnThis(),
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    limit: jest.fn(),
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
  });

  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    mockDb = createMockDb();
    drizzle = { db: mockDb } as unknown as jest.Mocked<DrizzleService>;
    service = new PipelineFeedbackService(drizzle);
  });

  it("stores feedback entry and returns it", async () => {
    const createdAt = new Date();
    const entry = {
      id: "feedback-1",
      startupId: "startup-1",
      phase: PipelinePhase.EVALUATION,
      agentKey: "market",
      feedback: "Re-check TAM assumptions with current benchmark data.",
      metadata: null,
      createdBy: "admin-1",
      consumedAt: null,
      createdAt,
      updatedAt: createdAt,
    };
    mockDb.returning.mockResolvedValueOnce([entry]);

    const result = await service.record({
      startupId: "startup-1",
      phase: PipelinePhase.EVALUATION,
      agentKey: "market",
      feedback: "Re-check TAM assumptions with current benchmark data.",
      createdBy: "admin-1",
    });

    expect(result).toEqual(entry);
    expect(mockDb.values).toHaveBeenCalledWith(
      expect.objectContaining({
        startupId: "startup-1",
        phase: PipelinePhase.EVALUATION,
        agentKey: "market",
        createdBy: "admin-1",
      }),
    );
  });

  it("returns latest unresolved feedback context for a scope", async () => {
    const now = new Date();
    const rows = [
      {
        id: "feedback-2",
        startupId: "startup-1",
        phase: PipelinePhase.EVALUATION,
        agentKey: "market",
        feedback: "Most recent feedback",
        metadata: null,
        createdBy: "admin-1",
        consumedAt: null,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "feedback-1",
        startupId: "startup-1",
        phase: PipelinePhase.EVALUATION,
        agentKey: "market",
        feedback: "Older feedback",
        metadata: null,
        createdBy: "admin-1",
        consumedAt: null,
        createdAt: new Date(now.getTime() - 1000),
        updatedAt: new Date(now.getTime() - 1000),
      },
    ];
    mockDb.limit.mockResolvedValueOnce(rows);

    const result = await service.getContext({
      startupId: "startup-1",
      phase: PipelinePhase.EVALUATION,
      agentKey: "market",
      limit: 5,
    });

    expect(result.items).toHaveLength(2);
    expect(result.items[0]?.id).toBe("feedback-2");
  });

  it("marks feedback entries consumed", async () => {
    mockDb.returning.mockResolvedValueOnce([{ id: "feedback-1" }, { id: "feedback-2" }]);

    const result = await service.markConsumed(["feedback-1", "feedback-2"]);

    expect(result).toBe(2);
    expect(mockDb.update).toHaveBeenCalledTimes(1);
  });

  it("no-ops markConsumed when ids are empty", async () => {
    const result = await service.markConsumed([]);

    expect(result).toBe(0);
    expect(mockDb.update).not.toHaveBeenCalled();
  });

  it("marks phase-level feedback consumed by scope", async () => {
    mockDb.returning.mockResolvedValueOnce([{ id: "feedback-1" }]);

    const result = await service.markConsumedByScope({
      startupId: "startup-1",
      phase: PipelinePhase.EVALUATION,
      agentKey: null,
    });

    expect(result).toBe(1);
    expect(mockDb.update).toHaveBeenCalledTimes(1);
  });

  it("throws BadRequestException when startupId is empty string", async () => {
    expect(() =>
      service.record({
        startupId: "",
        phase: PipelinePhase.EXTRACTION,
        feedback: "Test feedback",
        createdBy: "admin-1",
      }),
    ).toThrow("Invalid startupId: must be a non-empty string");
  });

  it("throws BadRequestException when startupId is invalid type", async () => {
    expect(() =>
      service.record({
        startupId: null as unknown as string,
        phase: PipelinePhase.EXTRACTION,
        feedback: "Test feedback",
        createdBy: "admin-1",
      }),
    ).toThrow("Invalid startupId: must be a non-empty string");
  });

  it("throws BadRequestException when phase is invalid", async () => {
    expect(() =>
      service.record({
        startupId: "startup-1",
        phase: "INVALID_PHASE" as unknown as PipelinePhase,
        feedback: "Test feedback",
        createdBy: "admin-1",
      }),
    ).toThrow("Invalid phase: INVALID_PHASE");
  });

  it("passes validation when startupId and phase are valid", async () => {
    const createdAt = new Date();
    const entry = {
      id: "feedback-1",
      startupId: "startup-1",
      phase: PipelinePhase.SCRAPING,
      agentKey: null,
      feedback: "Test feedback",
      metadata: null,
      createdBy: "admin-1",
      consumedAt: null,
      createdAt,
      updatedAt: createdAt,
    };
    mockDb.returning.mockResolvedValueOnce([entry]);

    const result = await service.record({
      startupId: "startup-1",
      phase: PipelinePhase.SCRAPING,
      feedback: "Test feedback",
      createdBy: "admin-1",
    });

    expect(result).toEqual(entry);
  });

  it("validates startupId in getContext", async () => {
    expect(() =>
      service.getContext({
        startupId: "",
        phase: PipelinePhase.EVALUATION,
      }),
    ).toThrow("Invalid startupId");
  });

  it("validates phase in getContext", async () => {
    expect(() =>
      service.getContext({
        startupId: "startup-1",
        phase: "BAD_PHASE" as unknown as PipelinePhase,
      }),
    ).toThrow("Invalid phase");
  });
});
