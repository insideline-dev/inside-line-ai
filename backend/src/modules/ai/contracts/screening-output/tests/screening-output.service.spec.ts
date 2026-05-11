import { describe, expect, it, jest } from "bun:test";
import { Test } from "@nestjs/testing";
import { DrizzleService } from "../../../../../database";
import { ScreeningOutputService } from "../screening-output.service";
import type { StartupLensResult } from "../../../entities/lens-result.schema";

const STARTUP_ID = "11111111-1111-1111-1111-111111111111";
const RUN_ID = "22222222-2222-2222-2222-222222222222";

type Row = StartupLensResult;

type DecisionRow = {
  classification: string;
  overallScore: number;
  reasonCodes: string[];
};

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
 * Mocks the Drizzle query chain. Three query shapes land on the same mock:
 *  - lens fetch: select().from().where().orderBy()  → returns `lensRows`
 *  - decision fetch: select({ classification, ... }).from().where().orderBy()
 *    → returns `decisionRows`
 *  - materials fetch: select({ pitchDeckUrl, ... }).from().where().limit(1)
 *    → returns `materialsRows`
 * Tests exercise service logic, not SQL.
 */
function buildDrizzleMock(
  lensRows: Row[],
  materialsRows: unknown[] = [],
  decisionRows: DecisionRow[] = [],
) {
  const select = jest.fn().mockImplementation((projection?: Record<string, unknown>) => {
    const isDecision = Boolean(projection && "classification" in projection);
    const isMaterials = Boolean(projection && "pitchDeckUrl" in projection);

    if (isDecision) {
      const final = { limit: jest.fn().mockResolvedValue(decisionRows) };
      const orderBy = jest.fn().mockReturnValue(final);
      const where = jest.fn().mockReturnValue({ orderBy, limit: final.limit });
      const from = jest.fn().mockReturnValue({ where });
      return { from };
    }

    if (isMaterials) {
      const limit = jest.fn().mockResolvedValue(materialsRows);
      const orderBy = jest.fn().mockReturnValue({ limit });
      const where = jest.fn().mockReturnValue({ orderBy, limit });
      const from = jest.fn().mockReturnValue({ where });
      return { from };
    }

    const orderBy = jest.fn().mockResolvedValue(lensRows);
    const limit = jest.fn().mockResolvedValue(lensRows);
    const where = jest.fn().mockReturnValue({ orderBy, limit });
    const from = jest.fn().mockReturnValue({ where });
    return { from };
  });
  return {
    db: { select },
    _spies: { select },
  };
}

async function buildService(
  lensRows: Row[],
  materialsRows: unknown[] = [],
  decisionRows: DecisionRow[] = [],
) {
  const drizzleMock = buildDrizzleMock(lensRows, materialsRows, decisionRows);
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
    expect(out.overall.nextAction).toBe("continue_evaluation");
    expect(out.overall.missingMaterials).toEqual([]);
    expect(out.handoff.evidenceSeeds).toHaveLength(0);
    expect(out.handoff.openIssues).toHaveLength(0);
    // generatedAt parses as a valid ISO datetime
    expect(Number.isNaN(Date.parse(out.generatedAt))).toBe(false);
  });

  it("builds screening DD handoff seeds from persisted screening rows", async () => {
    const rows = [
      row({
        lensKey: "team",
        score: 84,
        signal: "advance",
        evidence: [
          {
            claim:
              "Founders have prior domain experience and complementary technical and commercial backgrounds.",
            source: "https://example.com/team",
            confidence: "high",
          },
          {
            claim:
              "Founders have prior domain experience and complementary technical and commercial backgrounds.",
            source: "https://example.com/team",
            confidence: "high",
          },
        ],
      }),
      row({
        lensKey: "gtm",
        score: 72,
        signal: "review",
        evidence: [
          {
            claim:
              "Customer interviews show a repeatable outbound motion but limited conversion history.",
            confidence: "medium",
          },
        ],
      }),
    ];
    const startupRow = {
      ...FULLY_RESOURCED,
      pitchDeckUrl: null,
      teamMembers: [],
    };
    const decisionRows = [
      {
        classification: "review",
        overallScore: 78,
        reasonCodes: [
          "borderline_overall_score",
          "lens.gtm.review",
          "missing_materials",
        ],
      },
    ];
    const { service } = await buildService(rows, [startupRow], decisionRows);

    const out = await service.buildForStartup(STARTUP_ID, RUN_ID);

    expect(out.handoff.evidenceSeeds).toEqual([
      expect.objectContaining({
        lensKey: "team",
        lensLabel: "Team",
        claim:
          "Founders have prior domain experience and complementary technical and commercial backgrounds.",
        source: "https://example.com/team",
        confidence: "high",
        lensScore: 84,
        signal: "advance",
      }),
      expect.objectContaining({
        lensKey: "gtm",
        lensLabel: "Go-to-Market",
        claim:
          "Customer interviews show a repeatable outbound motion but limited conversion history.",
        source: undefined,
        confidence: "medium",
        lensScore: 72,
        signal: "review",
      }),
    ]);

    expect(out.handoff.openIssues).toEqual([
      expect.objectContaining({
        key: "missing:deck",
        label: "Pitch deck",
        summary: "Pitch deck is still missing from screening.",
        source: "screening-output",
      }),
      expect.objectContaining({
        key: "missing:team",
        label: "Team info",
        summary: "Team info is still missing from screening.",
        source: "screening-output",
      }),
      expect.objectContaining({
        key: "decision:borderline_overall_score",
        label: "Borderline scores",
        summary: "The overall screening score is still in the review band.",
        source: "triage-decision",
      }),
      expect.objectContaining({
        key: "decision:lens.gtm.review",
        label: "Go-to-Market needs follow-up",
        summary: "Go-to-Market still needs follow-up before DD can rely on it.",
        source: "triage-decision",
      }),
    ]);
  });

  it("falls back to lens signals when no triage decision exists", async () => {
    const rows = [
      row({ lensKey: "market", score: 80, signal: "advance" }),
      row({ lensKey: "team", score: 65, signal: "review" }),
      row({ lensKey: "traction", score: 30, signal: "reject" }),
    ];
    const { service } = await buildService(rows, [FULLY_RESOURCED]);

    const out = await service.buildForStartup(STARTUP_ID, RUN_ID);

    expect(out.handoff.openIssues).toEqual([
      expect.objectContaining({
        key: "lens:team:review",
        label: "Team",
        summary: "Team still needs follow-up before DD can rely on it.",
        source: "screening-output",
      }),
      expect.objectContaining({
        key: "lens:traction:reject",
        label: "Traction",
        summary: "Traction is still a screening blocker.",
        source: "screening-output",
      }),
    ]);
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
    expect(out.overall.nextAction).toBe("stop");
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
    expect(out.overall.nextAction).toBe("manual_review");
  });

  it("overall.signal = advance when all lenses advance", async () => {
    const rows = [
      row({ lensKey: "market", score: 90, signal: "advance" }),
      row({ lensKey: "team", score: 85, signal: "advance" }),
    ];
    const { service } = await buildService(rows);

    const out = await service.buildForStartup(STARTUP_ID, RUN_ID);

    expect(out.overall.signal).toBe("advance");
    expect(out.overall.nextAction).toBe("continue_evaluation");
    expect(out.overall.score).toBe(88); // round((90+85)/2)
  });

  it("uses the persisted triage decision when present", async () => {
    const rows = [
      row({ lensKey: "market", score: 90, signal: "advance" }),
      row({ lensKey: "team", score: 85, signal: "advance" }),
    ];
    const decisionRows = [
      {
        classification: "reject",
        overallScore: 88,
        reasonCodes: ["out_of_thesis_scope"],
      },
    ];
    const { service } = await buildService(rows, [], decisionRows);

    const out = await service.buildForStartup(STARTUP_ID, RUN_ID);

    expect(out.overall.signal).toBe("reject");
    expect(out.overall.nextAction).toBe("stop");
    expect(out.overall.score).toBe(88);
  });

  it("renders dealbreaker follow-up issues from triage decisions", async () => {
    const rows = [
      row({ lensKey: "market", score: 82, signal: "advance" }),
      row({ lensKey: "team", score: 76, signal: "advance" }),
    ];
    const decisionRows = [
      {
        classification: "reject",
        overallScore: 79,
        reasonCodes: ["dealbreaker:crypto"],
      },
    ];
    const { service } = await buildService(rows, [FULLY_RESOURCED], decisionRows);

    const out = await service.buildForStartup(STARTUP_ID, RUN_ID);

    expect(out.overall.signal).toBe("reject");
    expect(out.overall.nextAction).toBe("stop");
    expect(out.handoff.openIssues).toEqual([
      expect.objectContaining({
        key: "decision:dealbreaker:crypto",
        label: "Dealbreaker hit: crypto",
        summary: 'Investor thesis excludes "crypto".',
        source: "triage-decision",
      }),
    ]);
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

  // ─── DS-E7-F4-S1 — missing-materials checklist + REVIEW hold ──────
  const FULLY_RESOURCED = {
    pitchDeckUrl: "https://drive/deck.pdf",
    productDescription:
      "We build a vertical SaaS for clinics that automates billing reconciliation across 12 payer integrations.",
    description: "Healthcare billing automation",
    teamMembers: [
      { name: "A", role: "CEO" },
      { name: "B", role: "CTO" },
    ],
    fundingTarget: 2_000_000,
    valuation: 12_000_000,
    raiseType: "priced",
    website: "https://example.com",
  };

  it("downgrades all-advance verdict to review when materials are missing", async () => {
    const rows = [
      row({ lensKey: "market", score: 80, signal: "advance" }),
      row({ lensKey: "team", score: 75, signal: "advance" }),
      row({ lensKey: "traction", score: 70, signal: "advance" }),
    ];
    // Material gap: no pitch deck, no team. Lenses unanimous advance,
    // but the REVIEW hold prevents under-resourced DD.
    const startupRow = {
      ...FULLY_RESOURCED,
      pitchDeckUrl: null,
      teamMembers: [],
    };
    const { service } = await buildService(rows, [startupRow]);

    const out = await service.buildForStartup(STARTUP_ID, RUN_ID);

    expect(out.overall.signal).toBe("review");
    expect(out.overall.nextAction).toBe("request_materials");
    expect(out.overall.missingMaterials.sort()).toEqual([
      "deck",
      "team",
    ]);
  });

  it("treats pitchDeckPath as satisfying the deck requirement", async () => {
    const rows = [
      row({ lensKey: "market", score: 80, signal: "advance" }),
      row({ lensKey: "team", score: 75, signal: "advance" }),
    ];
    const startupRow = {
      ...FULLY_RESOURCED,
      pitchDeckUrl: null,
      pitchDeckPath: "startups/demo/deck.pdf",
    };
    const { service } = await buildService(rows, [startupRow]);

    const out = await service.buildForStartup(STARTUP_ID, RUN_ID);

    expect(out.overall.signal).toBe("advance");
    expect(out.overall.missingMaterials).not.toContain("deck");
  });

  it("keeps reject signal when materials are missing (reject still wins)", async () => {
    const rows = [
      row({ lensKey: "market", score: 80, signal: "advance" }),
      row({ lensKey: "team", score: 20, signal: "reject" }),
    ];
    const startupRow = { ...FULLY_RESOURCED, pitchDeckUrl: null };
    const { service } = await buildService(rows, [startupRow]);

    const out = await service.buildForStartup(STARTUP_ID, RUN_ID);

    expect(out.overall.signal).toBe("reject");
    expect(out.overall.nextAction).toBe("stop");
    expect(out.overall.missingMaterials).toEqual(["deck"]);
  });

  it("emits empty missingMaterials when startup is fully resourced", async () => {
    const rows = [
      row({ lensKey: "market", score: 80, signal: "advance" }),
      row({ lensKey: "team", score: 75, signal: "advance" }),
      row({ lensKey: "traction", score: 70, signal: "advance" }),
    ];
    const { service } = await buildService(rows, [FULLY_RESOURCED]);

    const out = await service.buildForStartup(STARTUP_ID, RUN_ID);

    expect(out.overall.signal).toBe("advance");
    expect(out.overall.missingMaterials).toEqual([]);
  });

  it("returns empty missingMaterials when startup row is not found", async () => {
    const rows = [
      row({ lensKey: "market", score: 80, signal: "advance" }),
      row({ lensKey: "team", score: 75, signal: "advance" }),
      row({ lensKey: "traction", score: 70, signal: "advance" }),
    ];
    const { service } = await buildService(rows, []); // no materials row

    const out = await service.buildForStartup(STARTUP_ID, RUN_ID);

    expect(out.overall.signal).toBe("advance");
    expect(out.overall.missingMaterials).toEqual([]);
  });
});
