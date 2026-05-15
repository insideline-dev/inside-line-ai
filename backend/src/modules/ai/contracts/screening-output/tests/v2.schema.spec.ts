import { describe, expect, it } from "bun:test";
import { ScreeningOutputV2Schema } from "../v2.schema";
import { ScreeningOutputV1Schema } from "../v1.schema";

const baseV1 = {
  version: 1 as const,
  startupId: "11111111-2222-4222-8444-555555555555",
  pipelineRunId: "run-1",
  generatedAt: "2026-05-15T20:00:00.000Z",
  overall: {
    score: 65,
    signal: "review" as const,
    nextAction: "request_materials" as const,
    missingMaterials: [],
  },
  handoff: { evidenceSeeds: [], openIssues: [] },
  lenses: [
    {
      key: "market",
      score: 70,
      signal: "advance" as const,
      rationale: "Strong fit.",
      evidence: [],
      modelId: "gpt-5.4",
      promptKey: "lens.market",
      latencyMs: 800,
      usedFallback: false,
    },
  ],
};

const baseV2 = {
  ...baseV1,
  version: 2 as const,
  thesisFit: null,
  lensScores: [{ key: "market" as const, score: 70, signal: "advance" as const }],
};

describe("ScreeningOutputV2Schema", () => {
  it("accepts a well-formed v2 payload with null thesisFit", () => {
    expect(() => ScreeningOutputV2Schema.parse(baseV2)).not.toThrow();
  });

  it("accepts a thesisFit object with per-axis status", () => {
    const parsed = ScreeningOutputV2Schema.parse({
      ...baseV2,
      thesisFit: {
        geography: { status: "match", note: "Paris, France fits Europe" },
        stage: { status: "match", note: "Series A matches focus" },
        sector: { status: "match", note: "AI/audio fits" },
        checkSize: { status: "borderline", note: "$4M above $500k-$3M" },
        overall: 78,
        rationale: "Strong on geo/stage/sector; check size is the main gap.",
      },
    });
    expect(parsed.thesisFit?.overall).toBe(78);
    expect(parsed.thesisFit?.checkSize.status).toBe("borderline");
  });

  it("rejects version literal !== 2", () => {
    expect(() =>
      ScreeningOutputV2Schema.parse({ ...baseV2, version: 1 }),
    ).toThrow();
  });

  it("rejects unknown lens keys in lensScores", () => {
    expect(() =>
      ScreeningOutputV2Schema.parse({
        ...baseV2,
        lensScores: [{ key: "founders", score: 70, signal: "advance" }],
      }),
    ).toThrow();
  });

  it("rejects out-of-range lens score", () => {
    expect(() =>
      ScreeningOutputV2Schema.parse({
        ...baseV2,
        lensScores: [{ key: "market", score: 200, signal: "advance" }],
      }),
    ).toThrow();
  });

  it("v1 and v2 share the same handoff / lenses shape", () => {
    // v1 payload should still parse cleanly under the v1 schema — i.e. the
    // shared fields didn't drift when v2 was introduced.
    expect(() => ScreeningOutputV1Schema.parse(baseV1)).not.toThrow();
  });
});
