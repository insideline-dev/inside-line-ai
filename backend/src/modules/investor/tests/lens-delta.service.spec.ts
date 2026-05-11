import { describe, expect, it, jest } from "bun:test";
import { Test } from "@nestjs/testing";
import { DrizzleService } from "../../../database";
import {
  LensDeltaService,
  summarizeLensDeltas,
  LENS_DELTA_DEAL_WINDOW,
} from "../lens-delta.service";

const STARTUP_ID = "11111111-1111-4111-8111-111111111111";
const PIPELINE_RUN_ID = "run-abc-123";
const INVESTOR_ID = "22222222-2222-4222-8222-222222222222";

interface ScreeningRow {
  lensKey: string;
  score: number;
  modelId: string;
  promptKey: string;
  createdAt: Date;
}

interface MatchRow {
  investorId: string;
}

/**
 * Builds a chainable Drizzle mock that returns the queued responses in
 * the order the service issues `.select(...)` calls. The service calls
 * select for the screening lens rows first, then for the match row.
 */
function buildDrizzleMock(opts: {
  screeningRows?: ScreeningRow[];
  matchRows?: MatchRow[];
}): {
  db: {
    select: jest.Mock;
    insert: jest.Mock;
    _insertedRows: Record<string, unknown>[];
  };
} {
  const { screeningRows = [], matchRows = [] } = opts;
  const selectResponses: unknown[] = [];
  selectResponses.push(screeningRows);
  selectResponses.push(matchRows);

  const insertedRows: Record<string, unknown>[] = [];

  const select = jest.fn().mockImplementation(() => {
    const next = selectResponses.shift() ?? [];
    const chain: {
      from: jest.Mock;
      where: jest.Mock;
      orderBy: jest.Mock;
      limit: jest.Mock;
      then: (resolve: (value: unknown) => unknown) => Promise<unknown>;
    } = {
      from: jest.fn(),
      where: jest.fn(),
      orderBy: jest.fn(),
      limit: jest.fn(),
      then: (resolve) => Promise.resolve(resolve(next)),
    };
    chain.from.mockReturnValue(chain);
    chain.where.mockReturnValue(chain);
    chain.orderBy.mockReturnValue(chain);
    chain.limit.mockReturnValue(chain);
    return chain;
  });

  const insert = jest.fn().mockImplementation(() => {
    let lastValues: Record<string, unknown> | null = null;
    const chain: {
      values: jest.Mock;
      onConflictDoUpdate: jest.Mock;
      returning: jest.Mock;
    } = {
      values: jest.fn(),
      onConflictDoUpdate: jest.fn(),
      returning: jest.fn(),
    };
    chain.values.mockImplementation((vals: Record<string, unknown>) => {
      lastValues = vals;
      return chain;
    });
    chain.onConflictDoUpdate.mockReturnValue(chain);
    chain.returning.mockImplementation(() => {
      if (lastValues) insertedRows.push(lastValues);
      return Promise.resolve(lastValues ? [lastValues] : []);
    });
    return chain;
  });

  return {
    db: { select, insert, _insertedRows: insertedRows },
  };
}

async function buildService(
  drizzleMock: ReturnType<typeof buildDrizzleMock>,
) {
  const moduleRef = await Test.createTestingModule({
    providers: [
      LensDeltaService,
      { provide: DrizzleService, useValue: drizzleMock },
    ],
  }).compile();
  return moduleRef.get(LensDeltaService);
}

describe("summarizeLensDeltas (pure)", () => {
  it("returns an empty array for no rows", () => {
    expect(summarizeLensDeltas([])).toEqual([]);
  });

  it("computes signed mean and absolute mean per lens", () => {
    const out = summarizeLensDeltas([
      {
        startupId: "s-1",
        lensKey: "team",
        delta: 10,
        computedAt: new Date("2026-05-01T12:00:00Z"),
      },
      {
        startupId: "s-2",
        lensKey: "team",
        delta: -4,
        computedAt: new Date("2026-05-02T12:00:00Z"),
      },
      {
        startupId: "s-1",
        lensKey: "market",
        delta: -8,
        computedAt: new Date("2026-05-01T12:00:00Z"),
      },
    ]);

    const byLens = Object.fromEntries(out.map((d) => [d.lensKey, d]));
    expect(byLens.team).toEqual({
      lensKey: "team",
      count: 2,
      meanDelta: 3,
      meanAbsDelta: 7,
    });
    expect(byLens.market).toEqual({
      lensKey: "market",
      count: 1,
      meanDelta: -8,
      meanAbsDelta: 8,
    });
  });

  it("collapses multiple pipeline runs for the same (startup, lens) to the latest", () => {
    const out = summarizeLensDeltas([
      {
        startupId: "s-1",
        lensKey: "team",
        delta: 30,
        computedAt: new Date("2026-04-01T12:00:00Z"),
      },
      {
        startupId: "s-1",
        lensKey: "team",
        delta: 5,
        computedAt: new Date("2026-05-10T12:00:00Z"),
      },
    ]);

    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      lensKey: "team",
      count: 1,
      meanDelta: 5,
      meanAbsDelta: 5,
    });
  });

  it("ignores unknown lens keys (defensive)", () => {
    const out = summarizeLensDeltas([
      {
        startupId: "s-1",
        lensKey: "product",
        delta: 99,
        computedAt: new Date(),
      },
    ]);
    expect(out).toEqual([]);
  });

  it("caps to the dealWindow most recent startups", () => {
    const now = Date.now();
    const rows = Array.from({ length: 10 }).map((_, i) => ({
      startupId: `s-${i}`,
      lensKey: "team",
      delta: 100, // identical so the count is what we assert
      computedAt: new Date(now - i * 60_000),
    }));
    const out = summarizeLensDeltas(rows, 3);
    expect(out).toHaveLength(1);
    expect(out[0].count).toBe(3);
  });

  it("exposes a sane default deal window", () => {
    expect(LENS_DELTA_DEAL_WINDOW).toBeGreaterThan(0);
  });
});

describe("LensDeltaService.computeAndPersistForEvaluation", () => {
  it("skips silently when no pipeline run id is provided", async () => {
    const drizzle = buildDrizzleMock({});
    const svc = await buildService(drizzle);

    const out = await svc.computeAndPersistForEvaluation({
      startupId: STARTUP_ID,
      pipelineRunId: null,
      evaluation: { team: { score: 80 } },
    });

    expect(out).toEqual([]);
    expect(drizzle.db.select).not.toHaveBeenCalled();
    expect(drizzle.db.insert).not.toHaveBeenCalled();
  });

  it("skips silently when DD evaluation produced no comparable scores", async () => {
    const drizzle = buildDrizzleMock({});
    const svc = await buildService(drizzle);

    const out = await svc.computeAndPersistForEvaluation({
      startupId: STARTUP_ID,
      pipelineRunId: PIPELINE_RUN_ID,
      evaluation: { team: null, market: null, traction: null },
    });

    expect(out).toEqual([]);
    expect(drizzle.db.select).not.toHaveBeenCalled();
  });

  it("skips silently when no screening lens results exist for the run", async () => {
    const drizzle = buildDrizzleMock({ screeningRows: [] });
    const svc = await buildService(drizzle);

    const out = await svc.computeAndPersistForEvaluation({
      startupId: STARTUP_ID,
      pipelineRunId: PIPELINE_RUN_ID,
      evaluation: { team: { score: 80 } },
    });

    expect(out).toEqual([]);
    expect(drizzle.db.insert).not.toHaveBeenCalled();
  });

  it("persists deltas for overlapping lenses and stamps versioning", async () => {
    const drizzle = buildDrizzleMock({
      screeningRows: [
        {
          lensKey: "team",
          score: 60,
          modelId: "gpt-4o",
          promptKey: "team@v2",
          createdAt: new Date("2026-05-01T11:00:00Z"),
        },
        {
          lensKey: "market",
          score: 75,
          modelId: "gpt-4o",
          promptKey: "market@v1",
          createdAt: new Date("2026-05-01T11:00:00Z"),
        },
        {
          lensKey: "traction",
          score: 50,
          modelId: "gpt-4o",
          promptKey: "traction@v1",
          createdAt: new Date("2026-05-01T11:00:00Z"),
        },
      ],
      matchRows: [{ investorId: INVESTOR_ID }],
    });
    const svc = await buildService(drizzle);

    const out = await svc.computeAndPersistForEvaluation({
      startupId: STARTUP_ID,
      pipelineRunId: PIPELINE_RUN_ID,
      evaluation: {
        team: { score: 78 },
        market: { score: 70 },
        traction: { score: 55 },
        ddAgentVersion: "gpt-5:eval@v3",
      },
    });

    expect(out).toHaveLength(3);
    const byLens = Object.fromEntries(
      drizzle.db._insertedRows.map((r) => [r.lensKey as string, r]),
    );
    expect(byLens.team).toMatchObject({
      startupId: STARTUP_ID,
      pipelineRunId: PIPELINE_RUN_ID,
      investorId: INVESTOR_ID,
      lensKey: "team",
      screeningScore: 60,
      ddScore: 78,
      delta: 18,
      screeningLensVersion: "gpt-4o:team@v2",
      ddAgentVersion: "gpt-5:eval@v3",
    });
    expect(byLens.market).toMatchObject({
      delta: -5,
      screeningScore: 75,
      ddScore: 70,
    });
    expect(byLens.traction).toMatchObject({
      delta: 5,
      screeningScore: 50,
      ddScore: 55,
    });
  });

  it("persists deltas even when no investor match exists (investorId=null)", async () => {
    const drizzle = buildDrizzleMock({
      screeningRows: [
        {
          lensKey: "team",
          score: 50,
          modelId: "gpt-4o",
          promptKey: "team@v1",
          createdAt: new Date(),
        },
      ],
      matchRows: [],
    });
    const svc = await buildService(drizzle);

    const out = await svc.computeAndPersistForEvaluation({
      startupId: STARTUP_ID,
      pipelineRunId: PIPELINE_RUN_ID,
      evaluation: { team: { score: 70 } },
    });

    expect(out).toHaveLength(1);
    expect(drizzle.db._insertedRows[0]).toMatchObject({
      lensKey: "team",
      delta: 20,
      investorId: null,
    });
  });

  it("skips lenses where the DD agent didn't produce a usable score", async () => {
    const drizzle = buildDrizzleMock({
      screeningRows: [
        {
          lensKey: "team",
          score: 50,
          modelId: "gpt-4o",
          promptKey: "team@v1",
          createdAt: new Date(),
        },
        {
          lensKey: "market",
          score: 60,
          modelId: "gpt-4o",
          promptKey: "market@v1",
          createdAt: new Date(),
        },
      ],
      matchRows: [{ investorId: INVESTOR_ID }],
    });
    const svc = await buildService(drizzle);

    const out = await svc.computeAndPersistForEvaluation({
      startupId: STARTUP_ID,
      pipelineRunId: PIPELINE_RUN_ID,
      // market is missing — should be skipped, not zero-filled.
      evaluation: { team: { score: 70 }, market: null },
    });

    expect(out).toHaveLength(1);
    expect(drizzle.db._insertedRows[0]).toMatchObject({ lensKey: "team" });
  });
});
