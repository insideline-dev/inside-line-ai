import { describe, expect, it } from "bun:test";
import { zodResponseFormat } from "openai/helpers/zod";
import {
  ExitPotentialEvaluationSchema,
  ExitScenarioSchema,
} from "./exit-potential.schema";

describe("ExitPotentialEvaluationSchema", () => {
  it("uses an OpenAI-strict schema for exit scenarios structured output", () => {
    expect(() => zodResponseFormat(ExitPotentialEvaluationSchema, "response")).not.toThrow();
  });

  it("normalizes null exit scenario strings to safe fallback values", () => {
    const parsed = ExitScenarioSchema.parse({
      scenario: "moderate",
      exitType: "M&A",
      exitValuation: null,
      timeline: null,
      moic: 2.5,
      irr: 0.31,
      researchBasis: null,
    });

    expect(parsed.exitValuation).toBe("Not provided");
    expect(parsed.timeline).toBe("Not provided");
    expect(parsed.researchBasis).toBe("Research basis pending");
  });

  it("normalizes missing return assessment values to safe defaults", () => {
    const parsed = ExitPotentialEvaluationSchema.parse({
      score: 24,
      confidence: "low",
      narrativeSummary: "Fallback evaluation.",
      keyFindings: [],
      risks: [],
      dataGaps: [],
      sources: [],
      returnAssessment: {},
    });

    expect(parsed.returnAssessment.moderateReturnsAdequate).toBe(false);
    expect(parsed.returnAssessment.conservativeReturnsCapital).toBe(false);
    expect(parsed.returnAssessment.impliedGrowthRealistic).toBe(false);
    expect(parsed.returnAssessment.grossReturnsDisclaimer.length).toBeGreaterThan(0);
  });
});
