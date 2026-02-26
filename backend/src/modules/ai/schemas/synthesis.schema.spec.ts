import { describe, expect, it } from "bun:test";
import { SynthesisSchema } from "./synthesis.schema";

describe("SynthesisSchema", () => {
  const valid = {
    overallScore: 78,
    recommendation: "Consider",
    executiveSummary: "Strong team with promising market.",
    strengths: ["Experienced founders"],
    concerns: ["Competitive market"],
    investmentThesis: "Worth deeper diligence",
    nextSteps: ["Schedule founder call"],
    confidenceLevel: "Medium",
    investorMemo: {
      executiveSummary: "Investor memo body",
      summary: "Test summary",
      sections: [],
      recommendation: "Consider",
      riskLevel: "medium" as const,
      dealHighlights: ["Strong team"],
      keyDueDiligenceAreas: ["Validate revenue"],
    },
    founderReport: {
      summary: "Founder report body",
      sections: [],
      actionItems: ["Focus on unit economics"],
    },
    dataConfidenceNotes: "Confidence notes",
  } as const;

  it("parses valid synthesis output", () => {
    const parsed = SynthesisSchema.parse(valid);
    expect(parsed.overallScore).toBe(78);
  });

  it("rejects invalid recommendation", () => {
    expect(() =>
      SynthesisSchema.parse({
        ...valid,
        recommendation: "Approve",
      }),
    ).toThrow();
  });

  it("requires executiveSummary", () => {
    expect(() =>
      SynthesisSchema.parse({
        ...valid,
        executiveSummary: "",
      }),
    ).toThrow();
  });
});
