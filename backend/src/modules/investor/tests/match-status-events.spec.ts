import { describe, it, expect, beforeEach, jest } from "bun:test";
import { MatchService } from "../match.service";
import type { DrizzleService } from "../../../database";
import type { StartupMatchingPipelineService } from "../../ai/services/startup-matching-pipeline.service";
import type { DealEventService } from "../../startup/deal-event.service";

// DS-E8-F1-S2 — kanban moves emit a `stage.changed` event so the
// partner-visible activity timeline reflects manual triage decisions.

describe("MatchService.updateMatchStatus → stage.changed event (DS-E8-F1-S2)", () => {
  const INVESTOR_ID = "11111111-1111-4111-8111-111111111111";
  const MATCH_ID = "22222222-2222-4222-8222-222222222222";
  const STARTUP_ID = "33333333-3333-4333-8333-333333333333";

  const makeMatch = (status: string) => ({
    id: MATCH_ID,
    investorId: INVESTOR_ID,
    startupId: STARTUP_ID,
    status,
    statusChangedAt: new Date(),
    meetingRequested: false,
    meetingRequestedAt: null,
  });

  let mockDb: {
    select: jest.Mock;
    from: jest.Mock;
    where: jest.Mock;
    limit: jest.Mock;
    update: jest.Mock;
    set: jest.Mock;
    returning: jest.Mock;
  };
  let drizzle: jest.Mocked<DrizzleService>;
  let pipeline: jest.Mocked<StartupMatchingPipelineService>;
  let dealEvents: jest.Mocked<DealEventService>;
  let service: MatchService;

  beforeEach(() => {
    mockDb = {
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn(),
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      returning: jest.fn(),
    } as never;

    drizzle = {
      db: mockDb,
      withRLS: jest.fn((_uid: string, cb: (db: typeof mockDb) => Promise<unknown>) => cb(mockDb)),
    } as unknown as jest.Mocked<DrizzleService>;
    pipeline = {} as unknown as jest.Mocked<StartupMatchingPipelineService>;
    dealEvents = {
      record: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<DealEventService>;

    service = new MatchService(drizzle, pipeline, dealEvents);
  });

  it("emits stage.changed when the kanban status actually changes", async () => {
    mockDb.limit.mockResolvedValueOnce([makeMatch("new")]);
    mockDb.returning.mockResolvedValueOnce([makeMatch("reviewing")]);

    await service.updateMatchStatus(INVESTOR_ID, MATCH_ID, { status: "reviewing" } as never);

    expect(dealEvents.record).toHaveBeenCalledTimes(1);
    expect(dealEvents.record).toHaveBeenCalledWith(
      expect.objectContaining({
        startupId: STARTUP_ID,
        actorUserId: INVESTOR_ID,
        type: "stage.changed",
        payload: expect.objectContaining({
          matchId: MATCH_ID,
          from: "new",
          to: "reviewing",
        }),
      }),
    );
  });

  it("threads passReason into the payload on a passed status", async () => {
    mockDb.limit.mockResolvedValueOnce([makeMatch("reviewing")]);
    mockDb.returning.mockResolvedValueOnce([makeMatch("passed")]);

    await service.updateMatchStatus(INVESTOR_ID, MATCH_ID, {
      status: "passed",
      passReason: "no_thesis_fit",
    } as never);

    expect(dealEvents.record).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "stage.changed",
        payload: expect.objectContaining({
          from: "reviewing",
          to: "passed",
          passReason: "no_thesis_fit",
        }),
      }),
    );
  });

  it("does NOT emit when the status is unchanged (no-op PATCH)", async () => {
    mockDb.limit.mockResolvedValueOnce([makeMatch("reviewing")]);
    mockDb.returning.mockResolvedValueOnce([makeMatch("reviewing")]);

    await service.updateMatchStatus(INVESTOR_ID, MATCH_ID, { status: "reviewing" } as never);

    expect(dealEvents.record).not.toHaveBeenCalled();
  });

  it("stays a no-op when DealEventService isn't wired (optional dependency)", async () => {
    const serviceWithoutEvents = new MatchService(drizzle, pipeline);
    mockDb.limit.mockResolvedValueOnce([makeMatch("new")]);
    mockDb.returning.mockResolvedValueOnce([makeMatch("engaged")]);

    await expect(
      serviceWithoutEvents.updateMatchStatus(INVESTOR_ID, MATCH_ID, {
        status: "engaged",
      } as never),
    ).resolves.toBeDefined();
  });
});
