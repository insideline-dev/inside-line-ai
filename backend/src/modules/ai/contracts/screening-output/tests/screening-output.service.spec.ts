import { describe, expect, it, jest } from "bun:test";
import { Test } from "@nestjs/testing";
import { DrizzleService } from "../../../../../database";
import { ScreeningOutputService } from "../screening-output.service";
import type { StartupLensResult } from "../../../entities/lens-result.schema";

const STARTUP_ID = "11111111-1111-1111-1111-111111111111";
const RUN_ID = "22222222-2222-2222-2222-222222222222";

type Row = StartupLensResult;

function row(partial: Partial<Row> & Pick<Row, "lensKey" | "score" | "signal">): Row {
  const now = new Date();
  return {
    id: `row-${partial.lensKey}-${partial.score}`,
    startupId: STARTUP_ID,
    pipelineRunId: partial.pipelineRunId ?? RUN_ID,
    lensKey: partial.lensKey,
    score: partial.score,
    signal: partial.signal,
    rationale: partial.rationale ?? "Looks good.",
    evidence: partial.evidence ?? [],
    modelId: partial.modelId ?? "gpt-test",
    promptKey: partial.promptKey ?? `lens.${partial.lensKey}`,
    latencyMs: partial.latencyMs ?? 1200,
    createdAt: partial.createdAt ?? now,
  };
}

/**
 * Mocks the Drizzle query chain `db.select().from().where().orderBy()`.
 * Returns whatever rows are passed in, regardless of the where clause —
 * tests exercise the service's filtering logic, not the SQL.
 */
function buildDrizzleMock(rows: Row[]) {
  const orderBy = jest.fn().mockResolvedValue(rows);
  const where = jest.fn().mockReturnValue({ orderBy });
  const from = jest.fn().mockReturnValue({ where });
  const select = jest.fn().mockReturnValue({ from });
  return {
    db: { select },
    _spies: { select, from, where, orderBy },
  };
}

async function buildService(rows: Row[]) {
  const drizzleMock = buildDrizzleMock(rows);
  const moduleRef = await Test.createTestingModule({
    providers: [
      ScreeningOutputService,
      { provide: DrizzleService, useValue: drizzleMock },
    ],
  }).compile();
  return {
    service: moduleRef.get(ScreeningOutputService),
    spies: drizzleMock._spies,
  };
}

describe("ScreeningOutputService", () => {
  it("builds a valid v1 contract from three lens rows", async () => {
    const rows = [
      row({ lensKey: "market", score: 80, signal: "advance" }),
      row({ lensKey: "team", score: 70, signal: "advance" }),
      row({ lensKey: "traction", score: 60, signal: "advance" }),
    ];
    const { service } = await buildService(rows);

    const out = await service.buildForStartup(STARTUP_ID, RUN_ID);

    expect(out.version).toBe(1);
    expect(out.startupId).toBe(STARTUP_ID);
    expect(out.pipelineRunId).toBe(RUN_ID);
    expect(out.lenses).toHaveLength(3);
    expect(out.lenses.map((l) => l.key).sort()).toEqual([
      "market",
      "team",
      "traction",
    ]);
    expect(out.overall.score).toBe(70); // (80+70+60)/3
    expect(out.overall.signal).toBe("advance");
    expect(out.overall.missingMaterials).toEqual([]);
    // generatedAt parses as a valid ISO datetime
    expect(Number.isNaN(Date.parse(out.generatedAt))).toBe(false);
  });

  it("overall.signal = reject when any lens is reject", async () => {
    const rows = [
      row({ lensKey: "market", score: 80, signal: "advance" }),
      row({ lensKey: "team", score: 30, signal: "reject" }),
      row({ lensKey: "traction", score: 50, signal: "review" }),
    ];
    const { service } = await buildService(rows);

    const out = await service.buildForStartup(STARTUP_ID, RUN_ID);

    expect(out.overall.signal).toBe("reject");
  });

  it("overall.signal = review when no reject but any review", async () => {
    const rows = [
      row({ lensKey: "market", score: 80, signal: "advance" }),
      row({ lensKey: "team", score: 65, signal: "review" }),
      row({ lensKey: "traction", score: 75, signal: "advance" }),
    ];
    const { service } = await buildService(rows);

    const out = await service.buildForStartup(STARTUP_ID, RUN_ID);

    expect(out.overall.signal).toBe("review");
  });

  it("overall.signal = advance when all lenses advance", async () => {
    const rows = [
      row({ lensKey: "market", score: 90, signal: "advance" }),
      row({ lensKey: "team", score: 85, signal: "advance" }),
    ];
    const { service } = await buildService(rows);

    const out = await service.buildForStartup(STARTUP_ID, RUN_ID);

    expect(out.overall.signal).toBe("advance");
    expect(out.overall.score).toBe(88); // round((90+85)/2)
  });

  it("latestForStartup returns null when no rows exist", async () => {
    const { service } = await buildService([]);

    const out = await service.latestForStartup(STARTUP_ID);

    expect(out).toBeNull();
  });

  it("latestForStartup scopes to the newest run id when present", async () => {
    const newer = new Date("2026-04-28T10:00:00Z");
    const older = new Date("2026-04-27T10:00:00Z");
    // Drizzle orderBy(desc(createdAt)) — pre-sort newest first to match
    // production ordering.
    const rows: Row[] = [
      row({
        lensKey: "market",
        score: 80,
        signal: "advance",
        pipelineRunId: "run-new",
        createdAt: newer,
      }),
      row({
        lensKey: "team",
        score: 30,
        signal: "reject",
        pipelineRunId: "run-old",
        createdAt: older,
      }),
    ];
    const { service } = await buildService(rows);

    const out = await service.latestForStartup(STARTUP_ID);

    expect(out).not.toBeNull();
    expect(out?.pipelineRunId).toBe("run-new");
    // Only the market lens belongs to run-new; team's reject must NOT bleed in.
    expect(out?.lenses.map((l) => l.key)).toEqual(["market"]);
    expect(out?.overall.signal).toBe("advance");
  });

  it("dedupes to the latest row per lens key", async () => {
    const newer = new Date("2026-04-28T10:00:00Z");
    const older = new Date("2026-04-28T09:00:00Z");
    const rows: Row[] = [
      row({ lensKey: "market", score: 90, signal: "advance", createdAt: newer }),
      row({ lensKey: "market", score: 10, signal: "reject", createdAt: older }),
    ];
    const { service } = await buildService(rows);

    const out = await service.buildForStartup(STARTUP_ID, RUN_ID);

    expect(out.lenses).toHaveLength(1);
    expect(out.lenses[0].score).toBe(90);
    expect(out.overall.signal).toBe("advance");
  });
});
