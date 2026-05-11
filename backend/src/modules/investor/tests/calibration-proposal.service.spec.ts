import { afterEach, describe, expect, it, jest } from "bun:test";
import { Test } from "@nestjs/testing";
import { NotFoundException } from "@nestjs/common";
import { DrizzleService } from "../../../database";
import { NotificationGateway } from "../../../notification/notification.gateway";
import { UserRole } from "../../../auth/entities/auth.schema";
import {
  buildSuggestedDelta,
  CalibrationProposalService,
} from "../calibration-proposal.service";
import type { CalibrationSummary } from "../calibration.service";

const INVESTOR_ID = "33333333-3333-4333-8333-333333333333";

function baseSummary(overrides: Partial<CalibrationSummary> = {}): CalibrationSummary {
  return {
    totalDecisions: 0,
    decisionsWithTriage: 0,
    aligned: 0,
    falsePositive: 0,
    falseNegative: 0,
    softMismatch: 0,
    alignmentRate: null,
    topOverrideReasons: [],
    recentMismatches: [],
    lensDeltas: [],
    ...overrides,
  };
}

interface FakeEventRow {
  id: string;
  investorUserId: string;
  type: string;
  payload: Record<string, unknown>;
  createdAt: Date;
}

/**
 * Drizzle-shape mock that:
 *   - `.select(...).from(...).where(...).limit(?)` resolves to a queued
 *     array (one queue per select call).
 *   - `.select(...).from(...).where(...).orderBy(...)` resolves to a
 *     queued array (event-history reads use orderBy, snapshot/user reads
 *     use limit).
 *   - `.insert(...).values(...).returning()` resolves to a single row
 *     synthesized from the values + a unique id + the current time.
 */
function buildDrizzleMock(opts: {
  /** Queued responses for `.select(...).limit(?)` calls (user, dedupe). */
  selectLimitResponses?: unknown[][];
  /** Queued responses for `.select(...).orderBy(?)` calls (event history). */
  selectOrderByResponses?: FakeEventRow[][];
}) {
  const { selectLimitResponses = [], selectOrderByResponses = [] } = opts;
  const inserts: FakeEventRow[] = [];

  const select = jest.fn().mockImplementation(() => {
    const chain: {
      from: jest.Mock;
      where: jest.Mock;
      orderBy: jest.Mock;
      limit: jest.Mock;
    } = {
      from: jest.fn(),
      where: jest.fn(),
      orderBy: jest.fn().mockImplementation(() => {
        const next = selectOrderByResponses.shift() ?? [];
        return Promise.resolve(next);
      }),
      limit: jest.fn().mockImplementation(() => {
        const next = selectLimitResponses.shift() ?? [];
        return Promise.resolve(next);
      }),
    };
    chain.from.mockReturnValue(chain);
    chain.where.mockReturnValue(chain);
    return chain;
  });

  const insert = jest.fn().mockImplementation(() => {
    let pendingValues: Record<string, unknown> | null = null;
    const chain: { values: jest.Mock; returning: jest.Mock } = {
      values: jest.fn().mockImplementation((vals: Record<string, unknown>) => {
        pendingValues = vals;
        return chain;
      }),
      returning: jest.fn().mockImplementation(() => {
        const row: FakeEventRow = {
          id: `evt-${inserts.length + 1}`,
          investorUserId: (pendingValues?.investorUserId as string) ?? "",
          type: (pendingValues?.type as string) ?? "",
          payload:
            (pendingValues?.payload as Record<string, unknown>) ?? {},
          createdAt: new Date(2026, 0, 1, 12, inserts.length),
        };
        inserts.push(row);
        return Promise.resolve([row]);
      }),
    };
    return chain;
  });

  return {
    db: { select, insert },
    inserts,
  };
}

function buildNotifications() {
  return {
    sendInvestorEvent: jest.fn(),
  };
}

async function buildService(
  drizzle: ReturnType<typeof buildDrizzleMock>,
  notifications: ReturnType<typeof buildNotifications> = buildNotifications(),
) {
  const moduleRef = await Test.createTestingModule({
    providers: [
      CalibrationProposalService,
      { provide: DrizzleService, useValue: drizzle },
      { provide: NotificationGateway, useValue: notifications },
    ],
  }).compile();
  return moduleRef.get(CalibrationProposalService);
}

describe("buildSuggestedDelta (heuristic)", () => {
  it("returns null when the summary is empty", () => {
    expect(buildSuggestedDelta(baseSummary())).toBeNull();
  });

  it("returns null when override counts are below the threshold and lens deltas are stable", () => {
    const out = buildSuggestedDelta(
      baseSummary({
        topOverrideReasons: [{ reasonTag: "team", count: 2 }],
        lensDeltas: [
          { lensKey: "team", count: 3, meanDelta: 4, meanAbsDelta: 4 },
        ],
      }),
    );
    expect(out).toBeNull();
  });

  it("fires when an override reason crosses the threshold", () => {
    const out = buildSuggestedDelta(
      baseSummary({
        topOverrideReasons: [
          { reasonTag: "team", count: 3 },
          { reasonTag: "pricing", count: 1 },
        ],
      }),
    );
    expect(out).not.toBeNull();
    expect(out?.overrideTagFocus).toEqual(["team"]);
    expect(out?.lensAdjustments).toEqual([]);
  });

  it("fires when an established lens drift crosses the threshold", () => {
    const out = buildSuggestedDelta(
      baseSummary({
        lensDeltas: [
          { lensKey: "team", count: 3, meanDelta: 12, meanAbsDelta: 12 },
          // 1 count → not enough to trust the mean — should not contribute.
          { lensKey: "market", count: 1, meanDelta: 20, meanAbsDelta: 20 },
        ],
      }),
    );
    expect(out).not.toBeNull();
    expect(out?.lensAdjustments).toEqual([
      { lensKey: "team", adjustment: 12 },
    ]);
    expect(out?.overrideTagFocus).toEqual([]);
  });
});

describe("CalibrationProposalService", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("maybeGenerateProposal", () => {
    it("returns null when the heuristic does not trip", async () => {
      const drizzle = buildDrizzleMock({});
      const notifications = buildNotifications();
      const svc = await buildService(drizzle, notifications);

      const result = await svc.maybeGenerateProposal(INVESTOR_ID, baseSummary());

      expect(result).toBeNull();
      expect(drizzle.db.insert).not.toHaveBeenCalled();
      expect(notifications.sendInvestorEvent).not.toHaveBeenCalled();
    });

    it("creates a proposal + WS event when the heuristic trips", async () => {
      const drizzle = buildDrizzleMock({
        // dedupe lookup → no prior duplicate
        selectLimitResponses: [[]],
      });
      const notifications = buildNotifications();
      const svc = await buildService(drizzle, notifications);

      const summary = baseSummary({
        topOverrideReasons: [{ reasonTag: "team", count: 3 }],
        lensDeltas: [
          { lensKey: "team", count: 3, meanDelta: 15, meanAbsDelta: 15 },
        ],
      });

      const result = await svc.maybeGenerateProposal(INVESTOR_ID, summary);

      expect(result).not.toBeNull();
      expect(result?.status).toBe("pending");
      expect(result?.suggestedDelta.overrideTagFocus).toEqual(["team"]);
      expect(result?.suggestedDelta.lensAdjustments).toEqual([
        { lensKey: "team", adjustment: 15 },
      ]);
      expect(drizzle.db.insert).toHaveBeenCalledTimes(1);
      expect(notifications.sendInvestorEvent).toHaveBeenCalledWith(
        INVESTOR_ID,
        "investor.calibration.proposal.created",
        expect.objectContaining({
          investorId: INVESTOR_ID,
          proposalId: result?.id,
        }),
      );
    });

    it("dedupes when a recent event with the same idempotency key exists", async () => {
      const drizzle = buildDrizzleMock({
        // dedupe lookup → a recent matching row exists
        selectLimitResponses: [[{ id: "evt-prior" }]],
      });
      const notifications = buildNotifications();
      const svc = await buildService(drizzle, notifications);

      const summary = baseSummary({
        topOverrideReasons: [{ reasonTag: "team", count: 5 }],
      });

      const result = await svc.maybeGenerateProposal(INVESTOR_ID, summary);

      expect(result).toBeNull();
      expect(drizzle.db.insert).not.toHaveBeenCalled();
      expect(notifications.sendInvestorEvent).not.toHaveBeenCalled();
    });
  });

  describe("listForInvestor", () => {
    it("folds approval/rejection events on top of created events", async () => {
      const created: FakeEventRow = {
        id: "evt-1",
        investorUserId: INVESTOR_ID,
        type: "calibration_proposal_created",
        payload: {
          proposalId: "p-1",
          idempotencyKey: "key-1",
          snapshotHash: "hash-1",
          status: "pending",
          suggestedDelta: {
            lensAdjustments: [],
            overrideTagFocus: ["team"],
          },
          evidence: { topOverrideReasons: [], lensDeltaSummary: [] },
        },
        createdAt: new Date("2026-05-10T10:00:00Z"),
      };
      const approved: FakeEventRow = {
        id: "evt-2",
        investorUserId: INVESTOR_ID,
        type: "calibration_proposal_approved",
        payload: { proposalId: "p-1" },
        createdAt: new Date("2026-05-10T11:00:00Z"),
      };
      const drizzle = buildDrizzleMock({
        // Newest-first as the service queries with desc(createdAt).
        selectOrderByResponses: [[approved, created]],
      });
      const svc = await buildService(drizzle);

      const pending = await svc.listForInvestor(INVESTOR_ID, "pending");
      expect(pending).toEqual([]);

      const drizzle2 = buildDrizzleMock({
        selectOrderByResponses: [[approved, created]],
      });
      const svc2 = await buildService(drizzle2);
      const approvedList = await svc2.listForInvestor(INVESTOR_ID, "approved");
      expect(approvedList).toHaveLength(1);
      expect(approvedList[0].status).toBe("approved");
      expect(approvedList[0].decidedAt).toBe(approved.createdAt.toISOString());
    });
  });

  describe("approve / reject", () => {
    function createdEvent(proposalId: string): FakeEventRow {
      return {
        id: "evt-create",
        investorUserId: INVESTOR_ID,
        type: "calibration_proposal_created",
        payload: {
          proposalId,
          idempotencyKey: "k",
          snapshotHash: "h",
          status: "pending",
          suggestedDelta: { lensAdjustments: [], overrideTagFocus: ["team"] },
          evidence: { topOverrideReasons: [], lensDeltaSummary: [] },
        },
        createdAt: new Date("2026-05-10T09:00:00Z"),
      };
    }

    it("approve writes an event and marks status approved", async () => {
      const drizzle = buildDrizzleMock({
        // Investor existence row + event history (one orderBy call) — the
        // existence check is via .limit, the history via .orderBy.
        selectLimitResponses: [[{ id: INVESTOR_ID, role: UserRole.INVESTOR }]],
        selectOrderByResponses: [[createdEvent("p-1")]],
      });
      const svc = await buildService(drizzle);

      const result = await svc.approve(INVESTOR_ID, "p-1");
      expect(result.status).toBe("approved");
      expect(drizzle.db.insert).toHaveBeenCalledTimes(1);
      expect(drizzle.inserts[0].type).toBe("calibration_proposal_approved");
      expect(drizzle.inserts[0].payload).toMatchObject({ proposalId: "p-1" });
    });

    it("reject captures the optional reason in the payload", async () => {
      const drizzle = buildDrizzleMock({
        selectLimitResponses: [[{ id: INVESTOR_ID, role: UserRole.INVESTOR }]],
        selectOrderByResponses: [[createdEvent("p-2")]],
      });
      const svc = await buildService(drizzle);

      const result = await svc.reject(INVESTOR_ID, "p-2", "too aggressive");
      expect(result.status).toBe("rejected");
      expect(result.rejectionReason).toBe("too aggressive");
      expect(drizzle.inserts[0].type).toBe("calibration_proposal_rejected");
      expect(drizzle.inserts[0].payload).toMatchObject({
        proposalId: "p-2",
        reason: "too aggressive",
      });
    });

    it("throws NotFound when the proposal does not belong to the investor", async () => {
      const drizzle = buildDrizzleMock({
        selectLimitResponses: [[{ id: INVESTOR_ID, role: UserRole.INVESTOR }]],
        selectOrderByResponses: [[]],
      });
      const svc = await buildService(drizzle);

      await expect(svc.approve(INVESTOR_ID, "unknown")).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it("throws NotFound when the user is not an investor/admin", async () => {
      const drizzle = buildDrizzleMock({
        selectLimitResponses: [[{ id: INVESTOR_ID, role: UserRole.SCOUT }]],
      });
      const svc = await buildService(drizzle);

      await expect(svc.approve(INVESTOR_ID, "p-1")).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
