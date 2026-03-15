import { describe, expect, it } from "bun:test";
import { zodResponseFormat } from "openai/helpers/zod";
import {
  SynthesisSchema,
  SynthesisSectionRewriteSchema,
} from "./synthesis.schema";

describe("SynthesisSchema", () => {
  it("uses an OpenAI-strict schema for final synthesis structured output", () => {
    expect(() => zodResponseFormat(SynthesisSchema, "response")).not.toThrow();
  });

  it("uses an OpenAI-strict schema for section rewrite structured output", () => {
    expect(() => zodResponseFormat(SynthesisSectionRewriteSchema, "response")).not.toThrow();
  });

  it("normalizes omitted memo section arrays to safe defaults", () => {
    const parsed = SynthesisSchema.parse({
      dealSnapshot: "Airbnb is a large consumer marketplace with mixed diligence signals.",
      keyStrengths: ["Strong marketplace liquidity."],
      keyRisks: ["Manual synthesis validation still required."],
      investorMemo: {
        executiveSummary: "Memo summary.",
        sections: [
          {
            title: "Team",
            content: "Team narrative.",
          },
        ],
        keyDueDiligenceAreas: [],
      },
      founderReport: {
        summary: "Founder-facing summary.",
      },
      dataConfidenceNotes: "Confidence notes.",
    });

    expect(parsed.investorMemo.sections[0]?.highlights).toEqual([]);
    expect(parsed.investorMemo.sections[0]?.concerns).toEqual([]);
    expect(parsed.investorMemo.sections[0]?.sources).toEqual([]);
    expect(parsed.founderReport.whatsWorking).toEqual([]);
    expect(parsed.founderReport.pathToInevitability).toEqual([]);
  });
});
