import { describe, expect, it } from "bun:test";
import { ScreeningOutputService } from "../screening-output.service";
import { ScreeningOutputV2Schema } from "../v2.schema";
import type { StartupLensResult } from "../../../entities/lens-result.schema";
import type { ThesisFitOutput } from "../../../schemas/thesis-fit.schema";

const STARTUP_ID = "11111111-2222-4222-8444-555555555555";

function lensRow(
  key: "market" | "team" | "traction",
  score: number,
  signal: "advance" | "review" | "reject",
): StartupLensResult {
  return {
    id: `${key}-row`,
    startupId: STARTUP_ID,
    pipelineRunId: "run-1",
    lensKey: key,
    score,
    signal,
    rationale: `${key} note`,
    evidence: [],
    modelId: "gpt-5.4",
    promptKey: `lens.${key}`,
    latencyMs: 500,
    lensVersion: "1",
    promptVersion: "1",
    createdAt: new Date(),
  } as unknown as StartupLensResult;
}

const thesisFit: ThesisFitOutput = {
  geography: { status: "match", note: "Paris fits Europe" },
  stage: { status: "match", note: "Series A matches" },
  sector: { status: "match", note: "AI/audio fits" },
  checkSize: { status: "borderline", note: "$4M above $500k-$3M" },
  overall: 78,
  rationale: "Strong on geo/stage/sector; check size is the main gap.",
};

describe("ScreeningOutputService.buildV2", () => {
  // Instance only used for method dispatch; no DB access needed for buildV2.
  const svc = new ScreeningOutputService({} as never);

  it("returns a payload that parses against the v2 schema", () => {
    const out = svc.buildV2(
      STARTUP_ID,
      "run-1",
      [lensRow("market", 70, "advance"), lensRow("team", 55, "review"), lensRow("traction", 60, "review")],
      null,
      null,
      thesisFit,
    );
    expect(() => ScreeningOutputV2Schema.parse(out)).not.toThrow();
    expect(out.version).toBe(2);
    expect(out.thesisFit?.overall).toBe(78);
  });

  it("populates lensScores as a compact roll-up keyed by lens", () => {
    const out = svc.buildV2(
      STARTUP_ID,
      "run-1",
      [lensRow("market", 70, "advance"), lensRow("team", 55, "review"), lensRow("traction", 60, "review")],
      null,
      null,
      null,
    );
    expect(out.lensScores).toHaveLength(3);
    const market = out.lensScores.find((s) => s.key === "market");
    expect(market?.score).toBe(70);
    expect(market?.signal).toBe("advance");
  });

  it("drops lensScores entries for unknown keys (forward-compat with extra lenses)", () => {
    const stray = lensRow("market", 70, "advance");
    (stray as { lensKey: string }).lensKey = "speculative";
    const out = svc.buildV2(STARTUP_ID, "run-1", [stray], null, null, null);
    expect(out.lensScores).toHaveLength(0);
  });

  it("permits null thesisFit (no thesis on file at run time)", () => {
    const out = svc.buildV2(STARTUP_ID, "run-1", [], null, null, null);
    expect(out.thesisFit).toBeNull();
    expect(() => ScreeningOutputV2Schema.parse(out)).not.toThrow();
  });

  it("preserves v1 fields verbatim (overall, handoff, lenses)", () => {
    const rows = [lensRow("market", 70, "advance")];
    const out = svc.buildV2(STARTUP_ID, "run-1", rows, null, null, null);
    expect(out.lenses).toHaveLength(1);
    expect(out.lenses[0].score).toBe(70);
    expect(out.overall).toBeDefined();
    expect(out.handoff).toBeDefined();
  });

  it("normalizes legacy deck and URL sources into typed citation metadata", () => {
    const row = lensRow("market", 70, "advance");
    row.evidence = [
      {
        claim: "Deck shows 92% gross margin",
        source: "deck:p7",
        confidence: "high",
      },
      {
        claim: "Website confirms enterprise focus",
        source: "https://example.com/customers",
        confidence: "medium",
      },
    ];

    const out = svc.buildV2(STARTUP_ID, "run-1", [row], null, null, null);

    expect(out.lenses[0]?.evidence[0]).toMatchObject({
      sourceType: "deck_page",
      pageNumber: 7,
      sourceRef: "deck:p7",
    });
    expect(out.lenses[0]?.evidence[1]).toMatchObject({
      sourceType: "public_url",
      url: "https://example.com/customers",
      sourceRef: "https://example.com/customers",
    });
  });
});
