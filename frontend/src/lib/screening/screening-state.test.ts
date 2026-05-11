// @ts-nocheck
import { describe, expect, it } from "bun:test";
import { resolveScreeningDisplayState } from "./screening-state";
import type { ScreeningOutputV1 } from "./useScreeningOutput";
import type { TriageDecision } from "./useTriageDecision";

const output: ScreeningOutputV1 = {
  version: 1,
  startupId: "123e4567-e89b-12d3-a456-426614174000",
  pipelineRunId: "run-1",
  generatedAt: "2026-05-06T00:00:00.000Z",
  overall: {
    score: 77,
    signal: "review",
    nextAction: "request_materials",
    missingMaterials: ["deck"],
  },
  lenses: [],
};

const decision: TriageDecision = {
  classification: "advance",
  nextAction: "continue_evaluation",
  overallScore: 91,
  reasonCodes: ["borderline_overall_score"],
  lensSnapshot: [],
  createdAt: "2026-05-06T00:00:00.000Z",
};

describe("resolveScreeningDisplayState", () => {
  it("prefers the triage decision when both sources are present", () => {
    const state = resolveScreeningDisplayState(output, decision);

    expect(state).toEqual({
      signal: "advance",
      score: 91,
      nextAction: "continue_evaluation",
      reasonCodes: ["borderline_overall_score"],
      missingMaterials: ["deck"],
      source: "decision",
    });
  });

  it("falls back to the screening output when the decision is absent", () => {
    const state = resolveScreeningDisplayState(output, null);

    expect(state).toEqual({
      signal: "review",
      score: 77,
      nextAction: "request_materials",
      reasonCodes: [],
      missingMaterials: ["deck"],
      source: "output",
    });
  });

  it("returns an empty state when neither source is available", () => {
    const state = resolveScreeningDisplayState(null, null);

    expect(state).toEqual({
      signal: null,
      score: null,
      nextAction: null,
      reasonCodes: [],
      missingMaterials: [],
      source: "none",
    });
  });
});
