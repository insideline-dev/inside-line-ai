import { describe, expect, it, jest } from "bun:test";
import { Test } from "@nestjs/testing";
import { DrizzleService } from "../../../../../database";
import {
  POLICY_SNAPSHOT,
  POLICY_VERSION,
  ScreeningTriageService,
  applyTriagePolicy,
  type TriageLensInput,
} from "../screening-triage.service";
import {
  screeningDecision,
  type ScreeningDecisionRow,
} from "../../../entities/screening-decision.schema";

const STARTUP_ID = "11111111-1111-4111-8111-111111111111";
const RUN_ID = "22222222-2222-2222-2222-222222222222";

function lens(
  key: string,
  score: number,
  signal: TriageLensInput["signal"],
): TriageLensInput {
  return { key, score, signal };
}

interface InsertCapture {
  values?: Record<string, unknown>;
}

/**
 * Mocks `db.insert(table).values(v).returning()` and `db.select().from()
 * .where().orderBy().limit()`. The select chain returns whatever rows are
 * pre-loaded; the insert chain captures the values the service passed in
 * and emits a synthetic row built from them.
 */
function buildDrizzleMock(opts: {
  insertRow?: ScreeningDecisionRow | null;
  selectRows?: ScreeningDecisionRow[];
} = {}) {
  const capture: InsertCapture = {};
  const returning = jest.fn().mockImplementation(async () => {
    if (opts.insertRow === null) return [];
    if (opts.insertRow) return [opts.insertRow];
    // Synthesize a row that mirrors what was inserted (so tests that don't
    // pre-supply a row can still assert on round-tripped values).
    const v = capture.values ?? {};
    const synthetic: ScreeningDecisionRow = {
      id: "decision-id",
      startupId: (v.startupId as string) ?? STARTUP_ID,
      pipelineRunId: (v.pipelineRunId as string | null) ?? null,
      classification: (v.classification as string) ?? "review",
      overallScore: (v.overallScore as number) ?? 0,
      reasonCodes: (v.reasonCodes as string[]) ?? [],
      lensSnapshot:
        (v.lensSnapshot as ScreeningDecisionRow["lensSnapshot"]) ?? [],
      policyVersion: (v.policyVersion as number) ?? POLICY_VERSION,
      createdAt: new Date(),
    };
    return [synthetic];
  });
  const values = jest.fn().mockImplementation((v: Record<string, unknown>) => {
    capture.values = v;
    return { returning };
  });
  const insert = jest.fn().mockReturnValue({ values });

  const limit = jest.fn().mockResolvedValue(opts.selectRows ?? []);
  const orderBy = jest.fn().mockReturnValue({ limit });
  const where = jest.fn().mockReturnValue({ orderBy });
  const from = jest.fn().mockReturnValue({ where });
  const select = jest.fn().mockReturnValue({ from });

  return {
    db: { insert, select },
    _capture: capture,
    _spies: { insert, values, returning, select, from, where, orderBy, limit },
  };
}

async function buildService(
  drizzleOpts?: Parameters<typeof buildDrizzleMock>[0],
) {
  const drizzleMock = buildDrizzleMock(drizzleOpts);
  const moduleRef = await Test.createTestingModule({
    providers: [
      ScreeningTriageService,
      { provide: DrizzleService, useValue: drizzleMock },
    ],
  }).compile();
  return {
    service: moduleRef.get(ScreeningTriageService),
    drizzle: drizzleMock,
  };
}

describe("policy snapshot", () => {
  it("locks the (version, thresholds) tuple — bump POLICY_VERSION when changing any threshold", () => {
    expect(POLICY_SNAPSHOT).toStrictEqual({
      POLICY_VERSION: 2,
      LOW_SCORE_THRESHOLD: 40,
      ADVANCE_SCORE_THRESHOLD: 60,
      OUT_OF_SCOPE_THESIS_THRESHOLD: 30,
      MIN_ADVANCE_EVIDENCE_COUNT: 2,
    });
  });
});

describe("applyTriagePolicy (pure)", () => {
  it("any reject lens → reject with per-lens reason codes", () => {
    const out = applyTriagePolicy([
      lens("market", 80, "advance"),
      lens("team", 20, "reject"),
      lens("traction", 70, "advance"),
    ]);
    expect(out.classification).toBe("reject");
    expect(out.reasonCodes).toEqual(["lens.team.reject"]);
    expect(out.overallScore).toBe(57); // round((80+20+70)/3)
  });

  it("multiple rejects produce one reason per offender", () => {
    const out = applyTriagePolicy([
      lens("market", 30, "reject"),
      lens("team", 20, "reject"),
      lens("traction", 70, "advance"),
    ]);
    expect(out.classification).toBe("reject");
    expect(out.reasonCodes.sort()).toEqual([
      "lens.market.reject",
      "lens.team.reject",
    ]);
  });

  it("all advance ≥ 60 → advance with no reasons", () => {
    const out = applyTriagePolicy([
      lens("market", 80, "advance"),
      lens("team", 70, "advance"),
      lens("traction", 60, "advance"),
    ]);
    expect(out.classification).toBe("advance");
    expect(out.overallScore).toBe(70);
    expect(out.reasonCodes).toEqual([]);
  });

  it("score < 40 with no rejects → reject(low_overall_score)", () => {
    const out = applyTriagePolicy([
      lens("market", 30, "advance"),
      lens("team", 35, "advance"),
      lens("traction", 40, "advance"),
    ]);
    expect(out.classification).toBe("reject");
    expect(out.reasonCodes).toEqual(["low_overall_score"]);
    expect(out.overallScore).toBe(35);
  });

  it("borderline 40-59 with all advance → review(borderline_overall_score)", () => {
    const out = applyTriagePolicy([
      lens("market", 50, "advance"),
      lens("team", 55, "advance"),
      lens("traction", 50, "advance"),
    ]);
    expect(out.classification).toBe("review");
    expect(out.overallScore).toBe(52);
    expect(out.reasonCodes).toEqual(["borderline_overall_score"]);
  });

  it("review signal triggers review even at high score", () => {
    const out = applyTriagePolicy([
      lens("market", 90, "advance"),
      lens("team", 75, "review"),
      lens("traction", 80, "advance"),
    ]);
    expect(out.classification).toBe("review");
    expect(out.reasonCodes).toEqual(["lens.team.review"]);
    expect(out.overallScore).toBe(82);
  });

  it("review + borderline stack reason codes", () => {
    const out = applyTriagePolicy([
      lens("market", 55, "review"),
      lens("team", 50, "advance"),
      lens("traction", 50, "advance"),
    ]);
    expect(out.classification).toBe("review");
    expect(out.reasonCodes).toEqual([
      "lens.market.review",
      "borderline_overall_score",
    ]);
  });

  it("rounds overall score correctly (47.7 → 48)", () => {
    const out = applyTriagePolicy([
      lens("a", 47, "advance"),
      lens("b", 48, "advance"),
      lens("c", 49, "advance"),
    ]);
    expect(out.overallScore).toBe(48);
  });

  // ─── DS-E4-F1-S1 — out-of-thesis-scope short-circuit ─────────────────
  it("thesisFitScore < 30 → reject(out_of_thesis_scope), short-circuits lens evaluation", () => {
    const out = applyTriagePolicy(
      [
        lens("market", 90, "advance"),
        lens("team", 85, "advance"),
        lens("traction", 80, "advance"),
      ],
      { thesisFitScore: 12 },
    );
    expect(out.classification).toBe("reject");
    expect(out.reasonCodes).toEqual(["out_of_thesis_scope"]);
    expect(out.overallScore).toBe(85); // still computed for audit trail
  });

  it("thesisFitScore >= 30 → policy proceeds normally", () => {
    const out = applyTriagePolicy(
      [
        lens("market", 90, "advance"),
        lens("team", 85, "advance"),
        lens("traction", 80, "advance"),
      ],
      { thesisFitScore: 30 },
    );
    expect(out.classification).toBe("advance");
    expect(out.reasonCodes).toEqual([]);
  });

  it("thesisFitScore null → policy proceeds normally (opt-out)", () => {
    const out = applyTriagePolicy(
      [
        lens("market", 90, "advance"),
        lens("team", 85, "advance"),
        lens("traction", 80, "advance"),
      ],
      { thesisFitScore: null },
    );
    expect(out.classification).toBe("advance");
    expect(out.reasonCodes).toEqual([]);
  });

  // ─── DS-E7-F2-S1 — no auto-advance without evidence ──────────────────
  it("advance with < 2 evidence items → downgrades to review(low_evidence)", () => {
    const out = applyTriagePolicy([
      {
        key: "market",
        score: 90,
        signal: "advance",
        evidence: [{ confidence: "high" }],
      },
      {
        key: "team",
        score: 85,
        signal: "advance",
        evidence: [
          { confidence: "high" },
          { confidence: "medium" },
        ],
      },
      {
        key: "traction",
        score: 80,
        signal: "advance",
        evidence: [
          { confidence: "high" },
          { confidence: "medium" },
        ],
      },
    ]);
    expect(out.classification).toBe("review");
    expect(out.reasonCodes).toContain("lens.market.low_evidence");
    expect(out.reasonCodes).not.toContain("lens.team.low_evidence");
  });

  it("advance with no high-confidence evidence → downgrades to review(low_evidence)", () => {
    const out = applyTriagePolicy([
      {
        key: "market",
        score: 90,
        signal: "advance",
        evidence: [
          { confidence: "low" },
          { confidence: "medium" },
        ],
      },
      {
        key: "team",
        score: 85,
        signal: "advance",
        evidence: [
          { confidence: "high" },
          { confidence: "medium" },
        ],
      },
      {
        key: "traction",
        score: 80,
        signal: "advance",
        evidence: [
          { confidence: "high" },
          { confidence: "medium" },
        ],
      },
    ]);
    expect(out.classification).toBe("review");
    expect(out.reasonCodes).toEqual(["lens.market.low_evidence"]);
  });

  it("advance with sufficient strong evidence → stays advance", () => {
    const strong = [{ confidence: "high" as const }, { confidence: "high" as const }];
    const out = applyTriagePolicy([
      { key: "market", score: 90, signal: "advance", evidence: strong },
      { key: "team", score: 85, signal: "advance", evidence: strong },
      { key: "traction", score: 80, signal: "advance", evidence: strong },
    ]);
    expect(out.classification).toBe("advance");
    expect(out.reasonCodes).toEqual([]);
  });

  it("evidence omitted → trusts signal as-is (backward compatibility)", () => {
    const out = applyTriagePolicy([
      lens("market", 90, "advance"),
      lens("team", 85, "advance"),
      lens("traction", 80, "advance"),
    ]);
    expect(out.classification).toBe("advance");
  });

  it("low_evidence + borderline score stack reason codes", () => {
    // One advance lens with thin evidence is downgraded; remaining lenses
    // produce a borderline overall score. Both reasons must surface.
    const out = applyTriagePolicy([
      {
        key: "market",
        score: 50,
        signal: "advance",
        evidence: [{ confidence: "low" }],
      },
      {
        key: "team",
        score: 50,
        signal: "advance",
        evidence: [
          { confidence: "high" },
          { confidence: "high" },
        ],
      },
      {
        key: "traction",
        score: 50,
        signal: "advance",
        evidence: [
          { confidence: "high" },
          { confidence: "high" },
        ],
      },
    ]);
    expect(out.classification).toBe("review");
    expect(out.overallScore).toBe(50);
    expect(out.reasonCodes).toEqual([
      "lens.market.low_evidence",
      "borderline_overall_score",
    ]);
  });

  it("low_evidence does not trigger when lens already says review", () => {
    const out = applyTriagePolicy([
      {
        key: "market",
        score: 60,
        signal: "review",
        evidence: [{ confidence: "low" }],
      },
      {
        key: "team",
        score: 85,
        signal: "advance",
        evidence: [{ confidence: "high" }, { confidence: "high" }],
      },
      {
        key: "traction",
        score: 80,
        signal: "advance",
        evidence: [{ confidence: "high" }, { confidence: "high" }],
      },
    ]);
    expect(out.classification).toBe("review");
    expect(out.reasonCodes).toEqual(["lens.market.review"]);
  });

  it("empty lens list → review(no_lens_signals)", () => {
    const out = applyTriagePolicy([]);
    expect(out.classification).toBe("review");
    expect(out.overallScore).toBe(0);
    expect(out.reasonCodes).toEqual(["no_lens_signals"]);
  });
});

describe("ScreeningTriageService", () => {
  it("decide() persists a row and returns the typed decision", async () => {
    const { service, drizzle } = await buildService();

    const decision = await service.decide({
      startupId: STARTUP_ID,
      pipelineRunId: RUN_ID,
      lensResults: [
        lens("market", 80, "advance"),
        lens("team", 70, "advance"),
        lens("traction", 60, "advance"),
      ],
    });

    expect(drizzle._spies.insert).toHaveBeenCalledTimes(1);
    expect(drizzle._spies.insert).toHaveBeenCalledWith(screeningDecision);
    expect(drizzle._capture.values).toMatchObject({
      startupId: STARTUP_ID,
      pipelineRunId: RUN_ID,
      classification: "advance",
      overallScore: 70,
      reasonCodes: [],
      policyVersion: POLICY_VERSION,
    });
    expect(decision.classification).toBe("advance");
    expect(decision.policyVersion).toBe(POLICY_VERSION);
    expect(decision.lensSnapshot).toHaveLength(3);
    // Snapshot must only contain (key, score, signal) — no rationale leakage.
    expect(Object.keys(decision.lensSnapshot[0]).sort()).toEqual([
      "key",
      "score",
      "signal",
    ]);
  });

  it("decide() persists null pipelineRunId when not supplied", async () => {
    const { service, drizzle } = await buildService();

    await service.decide({
      startupId: STARTUP_ID,
      lensResults: [lens("market", 80, "advance")],
    });

    expect(drizzle._capture.values?.pipelineRunId).toBeNull();
  });

  it("decide() throws when insert returns no row", async () => {
    const { service } = await buildService({ insertRow: null });

    await expect(
      service.decide({
        startupId: STARTUP_ID,
        pipelineRunId: RUN_ID,
        lensResults: [lens("market", 80, "advance")],
      }),
    ).rejects.toThrow(/insert returned no row/);
  });

  it("latestForStartup returns null when no rows exist", async () => {
    const { service } = await buildService({ selectRows: [] });

    const decision = await service.latestForStartup(STARTUP_ID);

    expect(decision).toBeNull();
  });

  it("latestForStartup hydrates the most recent row", async () => {
    const row: ScreeningDecisionRow = {
      id: "decision-1",
      startupId: STARTUP_ID,
      pipelineRunId: RUN_ID,
      classification: "review",
      overallScore: 55,
      reasonCodes: ["borderline_overall_score"],
      lensSnapshot: [{ key: "market", score: 55, signal: "advance" }],
      policyVersion: POLICY_VERSION,
      createdAt: new Date("2026-04-28T10:00:00Z"),
    };
    const { service } = await buildService({ selectRows: [row] });

    const decision = await service.latestForStartup(STARTUP_ID);

    expect(decision).not.toBeNull();
    expect(decision?.id).toBe("decision-1");
    expect(decision?.classification).toBe("review");
    expect(decision?.createdAt).toBe("2026-04-28T10:00:00.000Z");
  });
});
