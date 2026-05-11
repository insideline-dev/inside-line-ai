import { afterEach, describe, expect, it, jest } from "bun:test";
import { Test } from "@nestjs/testing";
import { NotFoundException } from "@nestjs/common";
import { DrizzleService } from "../../../database";
import { QueueService } from "../../../queue/queue.service";
import { UserRole } from "../../../auth/entities/auth.schema";
import { CalibrationRecomputeService } from "../calibration-recompute.service";
import {
  CALIBRATION_RECOMPUTE_DEDUPE_WINDOW_MS,
  CALIBRATION_RECOMPUTE_JOB,
} from "../calibration-recompute.constants";

const INVESTOR_ID = "11111111-1111-4111-8111-111111111111";

interface FakeSnapshotRow {
  investorId: string;
  summary: Record<string, unknown> | null;
  status: "queued" | "running" | "completed" | "failed";
  lastJobId: string | null;
  lastError: string | null;
  computedAt: Date | null;
  enqueuedAt: Date | null;
  updatedAt: Date;
}

/**
 * Builds a Drizzle-shaped mock that:
 *   - chainable `.select(..).from(..).where(..).limit(..)` resolves to a queued row array
 *   - chainable `.insert(..).values(..).onConflictDoUpdate(..).returning()` resolves to one row
 *   - chainable `.update(..).set(..).where(..)` resolves to undefined
 *
 * The investor existence check needs a row + role; the snapshot lookup
 * needs a row or empty; the decisions read needs an array.
 */
function buildDrizzleMock(opts: {
  investorExists?: boolean;
  investorRole?: string;
  existingSnapshot?: FakeSnapshotRow | null;
  decisionRows?: Array<{
    verdict: "advance" | "pass" | "hold";
    triage: string | null;
    reasonTags: string[];
    startupId: string;
    decidedAt: Date;
  }>;
  /** Skip investor-existence + snapshot reads (used by runJob tests that only compute). */
  selectsToSkip?: number;
}): {
  db: {
    select: jest.Mock;
    insert: jest.Mock;
    update: jest.Mock;
    _selectResponses: unknown[];
    _insertedRow: FakeSnapshotRow | null;
    _updateCalls: Record<string, unknown>[];
  };
} {
  const {
    investorExists = true,
    investorRole = UserRole.INVESTOR,
    existingSnapshot = null,
    decisionRows = [],
    selectsToSkip = 0,
  } = opts;

  // Responses queued in the order the service calls .select(...).
  // Default order: 1) investor existence, 2) snapshot lookup, 3) decisions read.
  // runJob() skips the first two — pass `selectsToSkip: 2` to drop them.
  const selectResponses: unknown[] = [];
  if (selectsToSkip < 1) {
    selectResponses.push(
      investorExists ? [{ id: INVESTOR_ID, role: investorRole }] : [],
    );
  }
  if (selectsToSkip < 2) {
    selectResponses.push(existingSnapshot ? [existingSnapshot] : []);
  }
  selectResponses.push(decisionRows);

  let insertedRow: FakeSnapshotRow | null = null;
  const updateCalls: Record<string, unknown>[] = [];

  const select = jest.fn().mockImplementation(() => {
    const next = selectResponses.shift() ?? [];
    const chain: {
      from: jest.Mock;
      where: jest.Mock;
      limit: jest.Mock;
      then: (resolve: (value: unknown) => unknown) => Promise<unknown>;
    } = {
      from: jest.fn(),
      where: jest.fn(),
      limit: jest.fn().mockResolvedValue(next),
      then: (resolve: (value: unknown) => unknown) =>
        Promise.resolve(resolve(next)),
    };
    chain.from.mockReturnValue(chain);
    chain.where.mockReturnValue(chain);
    return chain;
  });

  const insert = jest.fn().mockImplementation(() => {
    const chain: {
      values: jest.Mock;
      onConflictDoUpdate: jest.Mock;
      returning: jest.Mock;
    } = {
      values: jest.fn().mockImplementation((vals: Record<string, unknown>) => {
        insertedRow = vals as unknown as FakeSnapshotRow;
        return chain;
      }),
      onConflictDoUpdate: jest.fn().mockImplementation((opts: { set: Record<string, unknown> }) => {
        if (insertedRow) {
          insertedRow = {
            ...insertedRow,
            ...(opts.set as unknown as FakeSnapshotRow),
          };
        }
        return chain;
      }),
      returning: jest.fn().mockImplementation(() => Promise.resolve([insertedRow])),
    };
    return chain;
  });

  const update = jest.fn().mockImplementation(() => {
    const chain: { set: jest.Mock; where: jest.Mock } = {
      set: jest.fn().mockImplementation((vals: Record<string, unknown>) => {
        updateCalls.push(vals);
        return chain;
      }),
      where: jest.fn().mockResolvedValue(undefined),
    };
    return chain;
  });

  return {
    db: {
      select,
      insert,
      update,
      _selectResponses: selectResponses,
      get _insertedRow() {
        return insertedRow;
      },
      _updateCalls: updateCalls,
    },
  };
}

function buildQueueMock(jobId = "queue-job-id") {
  const add = jest.fn().mockResolvedValue({ id: jobId });
  const getQueue = jest.fn().mockReturnValue({ add });
  return { add, getQueue, mock: { getQueue } };
}

async function buildService(drizzleMock: ReturnType<typeof buildDrizzleMock>, queue: { getQueue: jest.Mock }) {
  const moduleRef = await Test.createTestingModule({
    providers: [
      CalibrationRecomputeService,
      { provide: DrizzleService, useValue: drizzleMock },
      { provide: QueueService, useValue: queue },
    ],
  }).compile();
  return moduleRef.get(CalibrationRecomputeService);
}

describe("CalibrationRecomputeService", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("getSnapshot", () => {
    it("throws NotFound when investor does not exist", async () => {
      const drizzle = buildDrizzleMock({ investorExists: false });
      const queue = buildQueueMock();
      const svc = await buildService(drizzle, queue.mock);

      await expect(svc.getSnapshot(INVESTOR_ID)).rejects.toThrow(NotFoundException);
    });

    it("throws NotFound when user is not an investor", async () => {
      const drizzle = buildDrizzleMock({ investorRole: UserRole.SCOUT });
      const queue = buildQueueMock();
      const svc = await buildService(drizzle, queue.mock);

      await expect(svc.getSnapshot(INVESTOR_ID)).rejects.toThrow(NotFoundException);
    });

    it("computes inline on first read and upserts a completed snapshot", async () => {
      const drizzle = buildDrizzleMock({
        existingSnapshot: null,
        decisionRows: [
          {
            verdict: "pass",
            triage: "advance",
            reasonTags: ["pricing"],
            startupId: "startup-1",
            decidedAt: new Date("2026-04-30T12:00:00Z"),
          },
        ],
      });
      const queue = buildQueueMock();
      const svc = await buildService(drizzle, queue.mock);

      const result = await svc.getSnapshot(INVESTOR_ID);

      expect(result.investorId).toBe(INVESTOR_ID);
      expect(result.status).toBe("completed");
      expect(result.summary.totalDecisions).toBe(1);
      expect(result.summary.falsePositive).toBe(1);
      expect(result.computedAt).not.toBeNull();
      expect(drizzle.db.insert).toHaveBeenCalledTimes(1);
    });

    it("returns the cached summary when a snapshot already exists", async () => {
      const cached = {
        totalDecisions: 7,
        decisionsWithTriage: 5,
        aligned: 3,
        falsePositive: 1,
        falseNegative: 1,
        softMismatch: 0,
        alignmentRate: 0.6,
        topOverrideReasons: [{ reasonTag: "team", count: 2 }],
        recentMismatches: [],
      };
      const drizzle = buildDrizzleMock({
        existingSnapshot: {
          investorId: INVESTOR_ID,
          summary: cached as unknown as Record<string, unknown>,
          status: "completed",
          lastJobId: "job-9",
          lastError: null,
          computedAt: new Date("2026-05-01T12:00:00Z"),
          enqueuedAt: null,
          updatedAt: new Date("2026-05-01T12:00:00Z"),
        },
      });
      const queue = buildQueueMock();
      const svc = await buildService(drizzle, queue.mock);

      const result = await svc.getSnapshot(INVESTOR_ID);

      expect(result.summary).toEqual(cached);
      expect(result.lastJobId).toBe("job-9");
      // Should not insert a new row when a cached one exists.
      expect(drizzle.db.insert).not.toHaveBeenCalled();
    });
  });

  describe("enqueueRecompute", () => {
    it("enqueues a fresh job when no snapshot exists", async () => {
      const drizzle = buildDrizzleMock({ existingSnapshot: null });
      const queue = buildQueueMock("bull-job-123");
      const svc = await buildService(drizzle, queue.mock);

      const result = await svc.enqueueRecompute(INVESTOR_ID);

      expect(result.status).toBe("queued");
      expect(result.dedupedToExistingJob).toBe(false);
      expect(result.jobId).toBe("bull-job-123");
      expect(queue.add).toHaveBeenCalledTimes(1);
      const [name, data, opts] = queue.add.mock.calls[0] as [
        string,
        { name: string; payload: { investorId: string } },
        { jobId: string },
      ];
      expect(name).toBe(CALIBRATION_RECOMPUTE_JOB);
      expect(data.payload.investorId).toBe(INVESTOR_ID);
      expect(opts.jobId).toContain(INVESTOR_ID);
      expect(drizzle.db.insert).toHaveBeenCalledTimes(1);
    });

    it("dedupes to the in-flight job id when prior status is queued", async () => {
      const drizzle = buildDrizzleMock({
        existingSnapshot: {
          investorId: INVESTOR_ID,
          summary: null,
          status: "queued",
          lastJobId: "in-flight-job",
          lastError: null,
          computedAt: null,
          enqueuedAt: new Date(),
          updatedAt: new Date(),
        },
      });
      const queue = buildQueueMock();
      const svc = await buildService(drizzle, queue.mock);

      const result = await svc.enqueueRecompute(INVESTOR_ID);

      expect(result.dedupedToExistingJob).toBe(true);
      expect(result.jobId).toBe("in-flight-job");
      expect(result.status).toBe("in_progress");
      expect(queue.add).not.toHaveBeenCalled();
    });

    it("dedupes when a completed recompute happened within the dedupe window", async () => {
      const drizzle = buildDrizzleMock({
        existingSnapshot: {
          investorId: INVESTOR_ID,
          summary: null,
          status: "completed",
          lastJobId: "recent-job",
          lastError: null,
          computedAt: new Date(),
          enqueuedAt: new Date(Date.now() - 1_000),
          updatedAt: new Date(),
        },
      });
      const queue = buildQueueMock();
      const svc = await buildService(drizzle, queue.mock);

      const result = await svc.enqueueRecompute(INVESTOR_ID);

      expect(result.dedupedToExistingJob).toBe(true);
      expect(result.jobId).toBe("recent-job");
      expect(queue.add).not.toHaveBeenCalled();
    });

    it("does not dedupe when the prior completed recompute is older than the dedupe window", async () => {
      const drizzle = buildDrizzleMock({
        existingSnapshot: {
          investorId: INVESTOR_ID,
          summary: null,
          status: "completed",
          lastJobId: "stale-job",
          lastError: null,
          computedAt: new Date(),
          enqueuedAt: new Date(Date.now() - CALIBRATION_RECOMPUTE_DEDUPE_WINDOW_MS - 1_000),
          updatedAt: new Date(),
        },
      });
      const queue = buildQueueMock("fresh-bull-id");
      const svc = await buildService(drizzle, queue.mock);

      const result = await svc.enqueueRecompute(INVESTOR_ID);

      expect(result.dedupedToExistingJob).toBe(false);
      expect(result.jobId).toBe("fresh-bull-id");
      expect(queue.add).toHaveBeenCalledTimes(1);
    });
  });

  describe("runJob", () => {
    it("marks running, recomputes, and upserts a completed snapshot", async () => {
      const drizzle = buildDrizzleMock({
        selectsToSkip: 2,
        decisionRows: [
          {
            verdict: "advance",
            triage: "advance",
            reasonTags: [],
            startupId: "s-1",
            decidedAt: new Date("2026-04-29T12:00:00Z"),
          },
          {
            verdict: "pass",
            triage: "advance",
            reasonTags: ["pricing"],
            startupId: "s-2",
            decidedAt: new Date("2026-04-30T12:00:00Z"),
          },
        ],
      });
      const queue = buildQueueMock();
      const svc = await buildService(drizzle, queue.mock);

      const { summary, computedAt } = await svc.runJob(INVESTOR_ID, "test-job-1");

      expect(summary.totalDecisions).toBe(2);
      expect(summary.aligned).toBe(1);
      expect(summary.falsePositive).toBe(1);
      expect(computedAt).toBeInstanceOf(Date);

      // First update = markRunning, then insert.upsert handles completion.
      expect(drizzle.db.update).toHaveBeenCalledTimes(1);
      expect(drizzle.db._updateCalls[0]).toMatchObject({
        status: "running",
        lastJobId: "test-job-1",
      });
      expect(drizzle.db.insert).toHaveBeenCalledTimes(1);
      expect(drizzle.db._insertedRow?.status).toBe("completed");
      expect(drizzle.db._insertedRow?.lastJobId).toBe("test-job-1");
    });
  });
});
