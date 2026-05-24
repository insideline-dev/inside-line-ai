import { describe, expect, it } from "bun:test";
import {
  ScreeningOutputV3Schema,
  type ScreeningDealbreakerObservation,
} from "./v3.schema";
import { buildDealbreakersObserved } from "./screening-output.service";

// DS-E10-F1 — typed contract additions for the DD handoff.

describe("buildDealbreakersObserved (DS-E10-F1)", () => {
  it("maps structured rule codes (DS-E4-F3) with the right action tier", () => {
    const result = buildDealbreakersObserved([
      "dealbreaker:structured:small-rounds:require_override",
      "dealbreaker:structured:no-crypto:reject",
    ]);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      kind: "structured",
      ref: "small-rounds",
      action: "require_override",
    });
    expect(result[1]).toMatchObject({
      kind: "structured",
      ref: "no-crypto",
      action: "reject",
    });
  });

  it("maps narrative dealbreaker tags (DS-E4-F4)", () => {
    const [observation] = buildDealbreakersObserved(["dealbreaker:crypto"]);
    expect(observation).toMatchObject({
      kind: "tag",
      ref: "crypto",
      action: "reject",
    });
    expect(observation.label).toContain("crypto");
  });

  it("maps portfolio-conflict codes (DS-E4-F2) with the company name", () => {
    const [observation] = buildDealbreakersObserved([
      "portfolio_conflict:Acme AI",
    ]);
    expect(observation.kind).toBe("portfolio");
    expect(observation.ref).toBe("Acme AI");
    expect(observation.label).toContain("Acme AI");
  });

  it("maps thesis-boundary codes (DS-E4-F1)", () => {
    const codes = ["out_of_stage", "out_of_scope", "out_of_geo"];
    const result = buildDealbreakersObserved(codes);
    expect(result.map((o) => o.ref).sort()).toEqual(
      ["geo", "scope", "stage"],
    );
    expect(result.every((o) => o.kind === "boundary")).toBe(true);
    expect(result.every((o) => o.action === "reject")).toBe(true);
  });

  it("ignores advisory codes (lens.*, score gates, missing materials)", () => {
    const result = buildDealbreakersObserved([
      "lens.market.reject",
      "borderline_overall_score",
      "missing_materials",
      "low_overall_score",
      "no_lens_signals",
    ]);
    expect(result).toEqual([]);
  });

  it("preserves order and produces stable codes that round-trip through the schema", () => {
    const observations: ScreeningDealbreakerObservation[] =
      buildDealbreakersObserved([
        "out_of_geo",
        "dealbreaker:structured:rule-1:reject",
      ]);
    for (const obs of observations) {
      // Each observation should validate against the schema.
      expect(() =>
        ScreeningOutputV3Schema.shape.dealbreakersObserved.element.parse(obs),
      ).not.toThrow();
    }
    expect(observations[0].code).toBe("out_of_geo");
    expect(observations[1].code).toBe(
      "dealbreaker:structured:rule-1:reject",
    );
  });
});

describe("ScreeningOutputV3Schema shape (DS-E10-F1)", () => {
  it("requires the three new fields on top of v2", () => {
    const fields = Object.keys(ScreeningOutputV3Schema.shape);
    expect(fields).toContain("dealbreakersObserved");
    expect(fields).toContain("reasoning");
    expect(fields).toContain("confidence");
  });

  it("rejects a v2-shaped payload that's missing the new fields", () => {
    const v2Payload = {
      version: 3,
      startupId: "11111111-1111-4111-8111-111111111111",
      pipelineRunId: null,
      generatedAt: "2026-05-22T10:00:00.000Z",
      overall: {
        score: 70,
        signal: "review" as const,
        nextAction: "request_materials" as const,
        missingMaterials: [],
      },
      handoff: { evidenceSeeds: [], openIssues: [] },
      lenses: [],
      thesisFit: null,
      lensScores: [],
    };
    expect(() => ScreeningOutputV3Schema.parse(v2Payload)).toThrow();
  });
});
