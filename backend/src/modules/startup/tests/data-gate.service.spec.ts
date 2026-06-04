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
  startupRow?: {
    userId?: string;
    dataGateStatus?: string | null;
    lastExtractionAt?: Date | null;
    docRequestedAt?: Date | null;
    contactEmail?: string | null;
  };
  matches?: Array<{ investorId: string; status: string }>;
  userRole?: UserRole | null;
  userEmail?: string | null;
  thesis?: { requiredDocTypes: string[] | null; autoAdvanceDataGate?: boolean } | null;
  presentDocs?: string[];
  // Result of the hasNewDocsSinceExtraction count query (docs with
  // uploadedAt >= lastExtractionAt). Drives the re-extraction phase decision.
  newDocsCount?: number;
  updateReturns?: Array<{ id: string }>;
}

import { startup } from "../entities/startup.schema";
import { dataRoom } from "../entities/data-room.schema";
import { user } from "../../../auth/entities/auth.schema";
import {
  investorThesis,
  startupMatch,
} from "../../investor/entities/investor.schema";
import { PipelinePhase } from "../../ai/interfaces/pipeline.interface";

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
  // hasNewDocsSinceExtraction projects `count`, every other dataRoom query
  // projects `category`. Detect by projection so the mock is order-independent.
  let isCountSelect = false;

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
                lastExtractionAt: s.startupRow.lastExtractionAt ?? null,
                docRequestedAt: s.startupRow.docRequestedAt ?? null,
                contactEmail: s.startupRow.contactEmail ?? null,
                id: STARTUP_ID,
              },
            ]
          : [];
      case "user":
        return s.userRole != null || s.userEmail != null
          ? [{ role: s.userRole, email: s.userEmail }]
          : [];
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
        return isCountSelect
          ? [{ count: s.newDocsCount ?? 0 }]
          : presentRows;
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
    select: jest.fn((projection?: Record<string, unknown>) => {
      isCountSelect = projection != null && "count" in projection;
      return selectChain;
    }),
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
  const pipeline = {
    rerunFromPhase: jest.fn(),
    startPipeline: jest.fn(),
    hasReusableScreeningResults: jest.fn().mockResolvedValue(true),
  };
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

  it("leaves missing Data Gate documents pending until an explicit Clara request", async () => {
    const { db } = makeDb({
      startupRow: {
        userId: SUBMITTER,
        dataGateStatus: DataGateStatus.PENDING,
        contactEmail: "founder@example.com",
      },
      matches: [{ investorId: ACTING_INVESTOR, status: "new" }],
      userRole: UserRole.FOUNDER,
      thesis: {
        requiredDocTypes: ["pitch_deck", "financial"],
        autoAdvanceDataGate: true,
      },
      presentDocs: ["pitch_deck"],
    });
    const { svc, pipeline } = buildService(db);

    const result = await svc.checkAutoAdvance(STARTUP_ID, ACTING_INVESTOR);

    expect(pipeline.rerunFromPhase).not.toHaveBeenCalled();
    expect(result).toEqual({
      status: "missing_docs_pending",
      missingMaterials: ["financial"],
    });
  });

  it("leaves the gate pending without email when founder email is unavailable", async () => {
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

    const result = await svc.checkAutoAdvance(STARTUP_ID, ACTING_INVESTOR);

    expect(pipeline.rerunFromPhase).not.toHaveBeenCalled();
    expect(result).toEqual({
      status: "missing_docs_pending",
      missingMaterials: ["financial"],
    });
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

describe("DataGateService.rerunDueDiligence — #10 re-extraction race", () => {
  beforeEach(() => jest.clearAllMocks());

  const advanceScenario = (extra: Partial<Scenario>): Scenario => ({
    startupRow: { userId: SUBMITTER, dataGateStatus: DataGateStatus.PENDING },
    matches: [{ investorId: ACTING_INVESTOR, status: "new" }],
    userRole: UserRole.FOUNDER,
    thesis: { requiredDocTypes: ["pitch_deck"], autoAdvanceDataGate: true },
    presentDocs: ["pitch_deck"],
    updateReturns: [{ id: STARTUP_ID }],
    ...extra,
  });

  it("#10 re-extracts (CLASSIFICATION) when a doc was uploaded during the last run", async () => {
    // Race: lastExtractionAt is stamped at the START of extraction. A doc
    // uploaded mid-run has uploadedAt >= the stamp, so the count query finds it
    // and hasNewDocsSinceExtraction returns true — DD must rebuild from
    // CLASSIFICATION rather than skipping straight to RESEARCH on stale content.
    const { db } = makeDb(
      advanceScenario({
        startupRow: {
          userId: SUBMITTER,
          dataGateStatus: DataGateStatus.PENDING,
          lastExtractionAt: new Date("2026-06-01T00:00:00Z"),
        },
        newDocsCount: 1,
      }),
    );
    const { svc, pipeline } = buildService(db);

    await svc.checkAutoAdvance(STARTUP_ID, ACTING_INVESTOR);

    expect(pipeline.rerunFromPhase).toHaveBeenCalledTimes(1);
    expect(pipeline.rerunFromPhase).toHaveBeenCalledWith(
      STARTUP_ID,
      PipelinePhase.CLASSIFICATION,
      { skipScreening: true },
    );
  });

  it("#10 skips extraction (RESEARCH) when no doc changed since the last run", async () => {
    const { db } = makeDb(
      advanceScenario({
        startupRow: {
          userId: SUBMITTER,
          dataGateStatus: DataGateStatus.PENDING,
          lastExtractionAt: new Date("2026-06-01T00:00:00Z"),
        },
        newDocsCount: 0,
      }),
    );
    const { svc, pipeline } = buildService(db);

    await svc.checkAutoAdvance(STARTUP_ID, ACTING_INVESTOR);

    expect(pipeline.rerunFromPhase).toHaveBeenCalledTimes(1);
    expect(pipeline.rerunFromPhase).toHaveBeenCalledWith(
      STARTUP_ID,
      PipelinePhase.RESEARCH,
      { skipScreening: true },
    );
  });

  it("#10 re-extracts (CLASSIFICATION) when extraction never ran", async () => {
    const { db } = makeDb(
      advanceScenario({
        startupRow: {
          userId: SUBMITTER,
          dataGateStatus: DataGateStatus.PENDING,
          lastExtractionAt: null,
        },
        newDocsCount: 0,
      }),
    );
    const { svc, pipeline } = buildService(db);

    await svc.checkAutoAdvance(STARTUP_ID, ACTING_INVESTOR);

    expect(pipeline.rerunFromPhase).toHaveBeenCalledTimes(1);
    expect(pipeline.rerunFromPhase).toHaveBeenCalledWith(
      STARTUP_ID,
      PipelinePhase.CLASSIFICATION,
      { skipScreening: true },
    );
  });

  // The investor-facing actions (Skip to Analysis / Request via Clara → complete)
  // must honour the same reuse-vs-re-extract decision, not just the auto-advance
  // path. These assert the user's exact scenario through the real entry points.
  it("complete() re-extracts (CLASSIFICATION) when a new data-room doc was uploaded", async () => {
    const { db } = makeDb({
      startupRow: {
        userId: SUBMITTER,
        dataGateStatus: DataGateStatus.PENDING,
        lastExtractionAt: new Date("2026-06-01T00:00:00Z"),
      },
      newDocsCount: 1,
      updateReturns: [{ id: STARTUP_ID }],
    });
    const { svc, pipeline } = buildService(db);

    await svc.complete(STARTUP_ID, ACTING_INVESTOR);

    expect(pipeline.rerunFromPhase).toHaveBeenCalledWith(
      STARTUP_ID,
      PipelinePhase.CLASSIFICATION,
      { skipScreening: true },
    );
  });

  it("complete() reuses DS data (RESEARCH) when nothing changed since extraction", async () => {
    const { db } = makeDb({
      startupRow: {
        userId: SUBMITTER,
        dataGateStatus: DataGateStatus.PENDING,
        lastExtractionAt: new Date("2026-06-01T00:00:00Z"),
      },
      newDocsCount: 0,
      updateReturns: [{ id: STARTUP_ID }],
    });
    const { svc, pipeline } = buildService(db);

    await svc.complete(STARTUP_ID, ACTING_INVESTOR);

    expect(pipeline.rerunFromPhase).toHaveBeenCalledWith(
      STARTUP_ID,
      PipelinePhase.RESEARCH,
      { skipScreening: true },
    );
  });

  it("skip() reuses DS data (RESEARCH) when nothing changed since extraction", async () => {
    const { db } = makeDb({
      startupRow: {
        userId: SUBMITTER,
        dataGateStatus: DataGateStatus.PENDING,
        lastExtractionAt: new Date("2026-06-01T00:00:00Z"),
      },
      newDocsCount: 0,
      updateReturns: [{ id: STARTUP_ID }],
    });
    const { svc, pipeline } = buildService(db);

    await svc.skip(STARTUP_ID, ACTING_INVESTOR);

    expect(pipeline.rerunFromPhase).toHaveBeenCalledWith(
      STARTUP_ID,
      PipelinePhase.RESEARCH,
      { skipScreening: true },
    );
  });

  it("restarts from CLASSIFICATION when screening results are missing, even with no new docs", async () => {
    // The Maven case: lastExtractionAt is set and no doc changed, but the
    // extraction/scraping results are not present (prior run still mid-run, or
    // state lost). Reusing here would queue research/evaluation without inputs
    // and fail them — so we must run the full screening flow from the start.
    const { db } = makeDb({
      startupRow: {
        userId: SUBMITTER,
        dataGateStatus: DataGateStatus.PENDING,
        lastExtractionAt: new Date("2026-06-01T00:00:00Z"),
      },
      newDocsCount: 0,
      updateReturns: [{ id: STARTUP_ID }],
    });
    const { svc, pipeline } = buildService(db);
    pipeline.hasReusableScreeningResults.mockResolvedValueOnce(false);

    await svc.complete(STARTUP_ID, ACTING_INVESTOR);

    expect(pipeline.rerunFromPhase).toHaveBeenCalledWith(
      STARTUP_ID,
      PipelinePhase.CLASSIFICATION,
      { skipScreening: true },
    );
  });
});
