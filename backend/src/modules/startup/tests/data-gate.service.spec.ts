import { describe, expect, it, jest, beforeEach } from "bun:test";
import { DataGateService } from "../data-gate.service";
import { DataGateStatus } from "../entities/startup.schema";
import { UserRole } from "../../../auth/entities/auth.schema";

const STARTUP_ID = "11111111-1111-4111-8111-111111111111";
const ACTING_INVESTOR = "22222222-2222-4222-8222-222222222222";
const OTHER_INVESTOR = "33333333-3333-4333-8333-333333333333";
const SUBMITTER = "44444444-4444-4444-8444-444444444444";

/**
 * Drizzle is fluent: select().from().where()[.limit()] and
 * update().set().where().returning(). Promises resolve at the terminal call.
 * We model each query as a "responder" picked by the table passed to .from()
 * / .update(), so tests stay readable instead of order-coupled.
 */
type TableKey = "startup" | "startupMatch" | "user" | "investorThesis" | "dataRoom";

interface Scenario {
  startupRow?: { userId?: string; dataGateStatus?: string | null };
  matches?: Array<{ investorId: string; status: string }>;
  userRole?: UserRole | null;
  thesis?: { requiredDocTypes: string[] | null; autoAdvanceDataGate?: boolean } | null;
  presentDocs?: string[];
  updateReturns?: Array<{ id: string }>;
}

import { startup } from "../entities/startup.schema";
import { dataRoom } from "../entities/data-room.schema";
import { user } from "../../../auth/entities/auth.schema";
import {
  investorThesis,
  startupMatch,
} from "../../investor/entities/investor.schema";

const TABLE_MAP = new WeakMap<object, TableKey>([
  [startup as object, "startup"],
  [startupMatch as object, "startupMatch"],
  [user as object, "user"],
  [investorThesis as object, "investorThesis"],
  [dataRoom as object, "dataRoom"],
]);

function makeDb(s: Scenario) {
  const presentRows = (s.presentDocs ?? []).map((category) => ({ category }));
  let currentTable: TableKey | null = null;

  const resolveSelect = async (): Promise<unknown[]> => {
    switch (currentTable) {
      case "startupMatch":
        return s.matches ?? [];
      case "startup":
        return s.startupRow
          ? [
              {
                userId: s.startupRow.userId,
                dataGateStatus: s.startupRow.dataGateStatus ?? null,
                id: STARTUP_ID,
              },
            ]
          : [];
      case "user":
        return s.userRole != null ? [{ role: s.userRole }] : [];
      case "investorThesis":
        return s.thesis
          ? [
              {
                requiredDocTypes: s.thesis.requiredDocTypes,
                autoAdvanceDataGate: s.thesis.autoAdvanceDataGate ?? false,
              },
            ]
          : [];
      case "dataRoom":
        return presentRows;
      default:
        return [];
    }
  };

  const selectChain = {
    from: jest.fn((t: object) => {
      currentTable = TABLE_MAP.get(t) ?? null;
      return selectChain;
    }),
    where: jest.fn(() => selectChain),
    limit: jest.fn(() => resolveSelect()),
    then: (onF: (v: unknown[]) => unknown, onR?: (e: unknown) => unknown) =>
      resolveSelect().then(onF, onR),
  };

  const updateChain = {
    set: jest.fn(() => updateChain),
    where: jest.fn(() => updateChain),
    returning: jest.fn(async () => s.updateReturns ?? []),
  };

  const db = {
    select: jest.fn(() => selectChain),
    update: jest.fn((t: object) => {
      currentTable = TABLE_MAP.get(t) ?? null;
      return updateChain;
    }),
  };

  return { db, updateChain };
}

function buildService(db: unknown) {
  const dealEvents = { record: jest.fn() };
  const openQuestionService = { listForStartup: jest.fn().mockResolvedValue([]) };
  const pipeline = { rerunFromPhase: jest.fn(), startPipeline: jest.fn() };
  const svc = new DataGateService(
    { db } as never,
    dealEvents as never,
    openQuestionService as never,
    pipeline as never,
  );
  return { svc, dealEvents, pipeline };
}

describe("DataGateService.checkAutoAdvance — owning investor resolution", () => {
  beforeEach(() => jest.clearAllMocks());

  it("#4 self-submitted private deal (no match) uses startup.userId thesis", async () => {
    const { db } = makeDb({
      startupRow: { userId: SUBMITTER, dataGateStatus: DataGateStatus.PENDING },
      matches: [],
      userRole: UserRole.INVESTOR, // submitter IS an investor
      thesis: { requiredDocTypes: ["pitch_deck"], autoAdvanceDataGate: true },
      presentDocs: ["pitch_deck"],
      updateReturns: [{ id: STARTUP_ID }],
    });
    const { svc, pipeline, dealEvents } = buildService(db);

    await svc.checkAutoAdvance(STARTUP_ID, SUBMITTER);

    expect(pipeline.rerunFromPhase).toHaveBeenCalledTimes(1);
    expect(dealEvents.record).toHaveBeenCalledWith(
      expect.objectContaining({ actorUserId: SUBMITTER }),
    );
  });

  it("falls back to most-advanced match when no acting investor (admin context)", async () => {
    const { db } = makeDb({
      startupRow: { userId: SUBMITTER, dataGateStatus: DataGateStatus.PENDING },
      matches: [
        { investorId: ACTING_INVESTOR, status: "new" },
        { investorId: OTHER_INVESTOR, status: "engaged" },
      ],
      userRole: UserRole.FOUNDER, // submitter is not an investor
      thesis: { requiredDocTypes: ["pitch_deck"], autoAdvanceDataGate: true },
      presentDocs: ["pitch_deck"],
      updateReturns: [{ id: STARTUP_ID }],
    });
    const { svc, pipeline, dealEvents } = buildService(db);

    await svc.checkAutoAdvance(STARTUP_ID); // no acting investor

    expect(pipeline.rerunFromPhase).toHaveBeenCalledTimes(1);
    // engaged > new → OTHER_INVESTOR is the most-advanced match.
    expect(dealEvents.record).toHaveBeenCalledWith(
      expect.objectContaining({ actorUserId: OTHER_INVESTOR }),
    );
  });

  it("#6 acting investor's thesis governs on multi-match deals", async () => {
    // OTHER_INVESTOR is the most-advanced match but ACTING_INVESTOR is the caller
    // and also has an active match → their thesis must win. Their thesis requires
    // pitch_deck which is present → advance.
    const { db } = makeDb({
      startupRow: { userId: SUBMITTER, dataGateStatus: DataGateStatus.PENDING },
      matches: [
        { investorId: OTHER_INVESTOR, status: "engaged" },
        { investorId: ACTING_INVESTOR, status: "new" },
      ],
      userRole: UserRole.FOUNDER, // submitter is NOT an investor
      thesis: { requiredDocTypes: ["pitch_deck"], autoAdvanceDataGate: true },
      presentDocs: ["pitch_deck"],
      updateReturns: [{ id: STARTUP_ID }],
    });
    const { svc, pipeline, dealEvents } = buildService(db);

    await svc.checkAutoAdvance(STARTUP_ID, ACTING_INVESTOR);

    expect(pipeline.rerunFromPhase).toHaveBeenCalledTimes(1);
    // checkAutoAdvance records the resolved owning investor as actorUserId — this
    // proves resolution returned ACTING_INVESTOR (branch 1), not the most-advanced
    // OTHER_INVESTOR match (the pre-fix behavior that caused bug #6).
    expect(dealEvents.record).toHaveBeenCalledWith(
      expect.objectContaining({ actorUserId: ACTING_INVESTOR }),
    );
  });

  it("bails (no advance) when gate is not PENDING", async () => {
    const { db } = makeDb({
      startupRow: { userId: SUBMITTER, dataGateStatus: DataGateStatus.COMPLETE },
      matches: [{ investorId: ACTING_INVESTOR, status: "new" }],
      thesis: { requiredDocTypes: ["pitch_deck"], autoAdvanceDataGate: true },
      presentDocs: ["pitch_deck"],
    });
    const { svc, pipeline } = buildService(db);

    await svc.checkAutoAdvance(STARTUP_ID, ACTING_INVESTOR);

    expect(pipeline.rerunFromPhase).not.toHaveBeenCalled();
  });

  it("does not advance when required docs missing", async () => {
    const { db } = makeDb({
      startupRow: { userId: SUBMITTER, dataGateStatus: DataGateStatus.PENDING },
      matches: [{ investorId: ACTING_INVESTOR, status: "new" }],
      userRole: UserRole.FOUNDER,
      thesis: {
        requiredDocTypes: ["pitch_deck", "financial"],
        autoAdvanceDataGate: true,
      },
      presentDocs: ["pitch_deck"],
    });
    const { svc, pipeline } = buildService(db);

    await svc.checkAutoAdvance(STARTUP_ID, ACTING_INVESTOR);

    expect(pipeline.rerunFromPhase).not.toHaveBeenCalled();
  });

  it("does not advance when autoAdvanceDataGate is false", async () => {
    const { db } = makeDb({
      startupRow: { userId: SUBMITTER, dataGateStatus: DataGateStatus.PENDING },
      matches: [{ investorId: ACTING_INVESTOR, status: "new" }],
      userRole: UserRole.FOUNDER,
      thesis: { requiredDocTypes: ["pitch_deck"], autoAdvanceDataGate: false },
      presentDocs: ["pitch_deck"],
    });
    const { svc, pipeline } = buildService(db);

    await svc.checkAutoAdvance(STARTUP_ID, ACTING_INVESTOR);

    expect(pipeline.rerunFromPhase).not.toHaveBeenCalled();
  });
});

describe("DataGateService.skip / complete — #8 compare-and-swap guard", () => {
  beforeEach(() => jest.clearAllMocks());

  it("complete() fires DD pipeline only on a real PENDING transition", async () => {
    const { db } = makeDb({
      startupRow: { userId: SUBMITTER, dataGateStatus: DataGateStatus.PENDING },
      updateReturns: [{ id: STARTUP_ID }],
    });
    const { svc, pipeline } = buildService(db);

    await svc.complete(STARTUP_ID, ACTING_INVESTOR);

    expect(pipeline.rerunFromPhase).toHaveBeenCalledTimes(1);
  });

  it("complete() is a no-op when gate already advanced (CAS miss)", async () => {
    const { db } = makeDb({
      startupRow: { userId: SUBMITTER, dataGateStatus: DataGateStatus.COMPLETE },
      updateReturns: [], // CAS matched no PENDING row
    });
    const { svc, pipeline, dealEvents } = buildService(db);

    await svc.complete(STARTUP_ID, ACTING_INVESTOR);

    expect(pipeline.rerunFromPhase).not.toHaveBeenCalled();
    expect(dealEvents.record).not.toHaveBeenCalled();
  });

  it("skip() is a no-op when gate already advanced (CAS miss)", async () => {
    const { db } = makeDb({
      startupRow: { userId: SUBMITTER, dataGateStatus: DataGateStatus.SKIPPED },
      updateReturns: [],
    });
    const { svc, pipeline, dealEvents } = buildService(db);

    await svc.skip(STARTUP_ID, ACTING_INVESTOR);

    expect(pipeline.rerunFromPhase).not.toHaveBeenCalled();
    expect(dealEvents.record).not.toHaveBeenCalled();
  });

  it("skip() throws NotFound when startup does not exist", async () => {
    const { db } = makeDb({ startupRow: undefined });
    const { svc } = buildService(db);

    await expect(svc.skip(STARTUP_ID, ACTING_INVESTOR)).rejects.toThrow(
      /not found/i,
    );
  });
});
