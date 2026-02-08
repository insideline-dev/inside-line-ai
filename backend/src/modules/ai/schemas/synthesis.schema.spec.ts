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
    investorMemo: "Investor memo body",
    founderReport: "Founder report body",
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
