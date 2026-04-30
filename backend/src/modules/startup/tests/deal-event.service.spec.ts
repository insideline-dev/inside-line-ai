import { describe, expect, it, jest } from "bun:test";
import { Test } from "@nestjs/testing";
import { DrizzleService } from "../../../database";
import { DealEventService } from "../deal-event.service";

const STARTUP_ID = "11111111-1111-4111-8111-111111111111";

interface MockDb {
  insert: jest.Mock;
  values: jest.Mock;
  returning: jest.Mock;
  select: jest.Mock;
  from: jest.Mock;
  where: jest.Mock;
  orderBy: jest.Mock;
  limit: jest.Mock;
}

function makeMockDb(overrides: Partial<MockDb> = {}): MockDb {
  return {
    insert: jest.fn().mockReturnThis(),
    values: jest.fn().mockReturnThis(),
    returning: jest.fn().mockResolvedValue([]),
    select: jest.fn().mockReturnThis(),
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockResolvedValue([]),
    ...overrides,
  } as MockDb;
}

async function build(db: MockDb): Promise<DealEventService> {
  const moduleRef = await Test.createTestingModule({
    providers: [
      DealEventService,
      { provide: DrizzleService, useValue: { db } },
    ],
  }).compile();
  return moduleRef.get(DealEventService);
}

describe("DealEventService", () => {
  it("record() inserts and returns the row", async () => {
    const row = {
      id: "evt-1",
      startupId: STARTUP_ID,
      actorUserId: "user-1",
      type: "triage.decided",
      payload: { classification: "advance" },
      occurredAt: new Date(),
    };
    const db = makeMockDb({
      returning: jest.fn().mockResolvedValueOnce([row]),
    });
    const svc = await build(db);

    const out = await svc.record({
      startupId: STARTUP_ID,
      actorUserId: "user-1",
      type: "triage.decided",
      payload: { classification: "advance" },
    });

    expect(out).toEqual(row);
    expect(db.values).toHaveBeenCalledWith(
      expect.objectContaining({
        startupId: STARTUP_ID,
        type: "triage.decided",
      }),
    );
  });

  it("record() defaults payload to {} and actorUserId to null", async () => {
    const db = makeMockDb({
      returning: jest.fn().mockResolvedValueOnce([{}]),
    });
    const svc = await build(db);

    await svc.record({
      startupId: STARTUP_ID,
      type: "screening.completed",
    });

    expect(db.values).toHaveBeenCalledWith(
      expect.objectContaining({ actorUserId: null, payload: {} }),
    );
  });

  it("record() returns null on insert failure (never throws)", async () => {
    const db = makeMockDb({
      returning: jest.fn().mockRejectedValueOnce(new Error("boom")),
    });
    const svc = await build(db);

    const out = await svc.record({
      startupId: STARTUP_ID,
      type: "startup.approved",
    });

    expect(out).toBeNull();
  });

  it("forStartup() returns rows ordered desc with default limit", async () => {
    const rows = [{ id: "a" }, { id: "b" }];
    const db = makeMockDb({
      limit: jest.fn().mockResolvedValueOnce(rows),
    });
    const svc = await build(db);

    const out = await svc.forStartup(STARTUP_ID);

    expect(out).toEqual(rows);
    expect(db.orderBy).toHaveBeenCalled();
    expect(db.limit).toHaveBeenCalledWith(200);
  });

  it("forStartup() clamps limit to [1, 500]", async () => {
    const db = makeMockDb({
      limit: jest.fn().mockResolvedValue([]),
    });
    const svc = await build(db);

    await svc.forStartup(STARTUP_ID, { limit: 9999 });
    expect(db.limit).toHaveBeenLastCalledWith(500);

    await svc.forStartup(STARTUP_ID, { limit: 0 });
    expect(db.limit).toHaveBeenLastCalledWith(1);
  });
});
