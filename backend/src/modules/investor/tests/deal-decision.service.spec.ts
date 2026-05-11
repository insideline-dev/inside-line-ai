import { describe, expect, it, jest } from "bun:test";
import { NotFoundException } from "@nestjs/common";
import { DealDecisionService } from "../deal-decision.service";

const INVESTOR_ID = "11111111-1111-4111-8111-111111111111";
const STARTUP_ID = "22222222-2222-4222-8222-222222222222";

interface MockDb {
  select: jest.Mock;
  from: jest.Mock;
  where: jest.Mock;
  orderBy: jest.Mock;
  limit: jest.Mock;
  insert: jest.Mock;
  values: jest.Mock;
  returning: jest.Mock;
}

function makeMockDb(overrides: Partial<MockDb> = {}): MockDb {
  const mock: MockDb = {
    select: jest.fn().mockReturnThis(),
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    limit: jest.fn(),
    insert: jest.fn().mockReturnThis(),
    values: jest.fn().mockReturnThis(),
    returning: jest.fn(),
    ...overrides,
  };
  return mock;
}

async function build(db: MockDb): Promise<{
  service: DealDecisionService;
  dealEvents: { record: jest.Mock };
  screeningTriage: { latestForStartup: jest.Mock };
}> {
  const dealEvents = { record: jest.fn().mockResolvedValue(null) };
  const screeningTriage = {
    latestForStartup: jest.fn().mockResolvedValue(null),
  };
  return {
    service: new DealDecisionService(
      { db } as never,
      dealEvents as never,
      screeningTriage as never,
    ),
    dealEvents,
    screeningTriage,
  };
}

const STARTUP_FOUND_ROW = [{ id: STARTUP_ID }];
const PERSISTED_ROW = {
  id: "deal-decision-1",
  investorId: INVESTOR_ID,
  startupId: STARTUP_ID,
  verdict: "pass" as const,
  reasonTags: ["pricing"],
  notes: null,
  triageClassificationAtDecision: "advance",
  decidedAt: new Date("2026-04-30T12:00:00Z"),
};

describe("DealDecisionService", () => {
  it("record() persists and returns the row", async () => {
    const db = makeMockDb({
      limit: jest.fn().mockResolvedValueOnce(STARTUP_FOUND_ROW),
      returning: jest.fn().mockResolvedValueOnce([PERSISTED_ROW]),
    });
    const { service, screeningTriage, dealEvents } = await build(db);
    screeningTriage.latestForStartup.mockResolvedValueOnce({ classification: "advance" });

    const out = await service.record(INVESTOR_ID, STARTUP_ID, {
      verdict: "pass",
      reasonTags: ["pricing"],
      triageClassificationAtDecision: "reject" as never,
    } as never);

    expect(screeningTriage.latestForStartup).toHaveBeenCalledWith(STARTUP_ID);
    expect(db.insert).toHaveBeenCalled();
    expect(db.values).toHaveBeenCalledWith(
      expect.objectContaining({
        investorId: INVESTOR_ID,
        startupId: STARTUP_ID,
        verdict: "pass",
        reasonTags: ["pricing"],
        triageClassificationAtDecision: "advance",
        notes: null,
      }),
    );
    expect(dealEvents.record).toHaveBeenCalledWith(
      expect.objectContaining({
        startupId: STARTUP_ID,
        actorUserId: INVESTOR_ID,
        type: "decision.recorded",
        payload: expect.objectContaining({
          verdict: "pass",
          reasonTags: ["pricing"],
          triageClassificationAtDecision: "advance",
          calibration: expect.objectContaining({
            comparisonAvailable: true,
            mismatchType: "false_positive",
            modelVerdict: "advance",
            investorVerdict: "pass",
            reasonTags: ["pricing"],
          }),
        }),
      }),
    );
    expect(out).toEqual(PERSISTED_ROW);
  });

  it("record() defaults reasonTags to []", async () => {
    const db = makeMockDb({
      limit: jest.fn().mockResolvedValueOnce(STARTUP_FOUND_ROW),
      returning: jest.fn().mockResolvedValueOnce([
        { ...PERSISTED_ROW, reasonTags: [] },
      ]),
    });
    const { service } = await build(db);

    await service.record(INVESTOR_ID, STARTUP_ID, { verdict: "advance" });

    expect(db.values).toHaveBeenCalledWith(
      expect.objectContaining({ reasonTags: [] }),
    );
  });

  it("record() throws NotFound when startup does not exist", async () => {
    const db = makeMockDb({
      limit: jest.fn().mockResolvedValueOnce([]),
    });
    const { service } = await build(db);

    await expect(
      service.record(INVESTOR_ID, STARTUP_ID, { verdict: "pass" }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("record() throws when insert returns nothing", async () => {
    const db = makeMockDb({
      limit: jest.fn().mockResolvedValueOnce(STARTUP_FOUND_ROW),
      returning: jest.fn().mockResolvedValueOnce([]),
    });
    const { service } = await build(db);

    await expect(
      service.record(INVESTOR_ID, STARTUP_ID, { verdict: "pass" }),
    ).rejects.toThrow("insert returned no row");
  });

  it("latest() returns null when no decision exists", async () => {
    const db = makeMockDb({
      limit: jest.fn().mockResolvedValueOnce([]),
    });
    const { service } = await build(db);

    const out = await service.latest(INVESTOR_ID, STARTUP_ID);
    expect(out).toBeNull();
  });

  it("latest() returns the most recent row", async () => {
    const db = makeMockDb({
      limit: jest.fn().mockResolvedValueOnce([PERSISTED_ROW]),
    });
    const { service } = await build(db);

    const out = await service.latest(INVESTOR_ID, STARTUP_ID);
    expect(out).toEqual(PERSISTED_ROW);
    expect(db.orderBy).toHaveBeenCalled();
  });
});
