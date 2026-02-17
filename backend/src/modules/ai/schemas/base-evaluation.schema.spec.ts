import { describe, expect, it } from "bun:test";
import { BaseEvaluationSchema } from "./base-evaluation.schema";

describe("BaseEvaluationSchema", () => {
  it("parses valid data", () => {
    const parsed = BaseEvaluationSchema.parse({
      score: 85,
      confidence: 0.9,
      feedback: "The team demonstrates strong execution capability with proven domain expertise.",
      keyFindings: ["Strong team"],
      risks: [],
      dataGaps: [],
      sources: [],
    });

    expect(parsed.score).toBe(85);
    expect(parsed.feedback).toBeTruthy();
  });

  it("rejects invalid scores and confidence", () => {
    expect(() =>
      BaseEvaluationSchema.parse({
        score: -1,
        confidence: 0.9,
        keyFindings: ["x"],
      }),
    ).toThrow();

    expect(() =>
      BaseEvaluationSchema.parse({
        score: 101,
        confidence: 0.9,
        keyFindings: ["x"],
      }),
    ).toThrow();

    expect(() =>
      BaseEvaluationSchema.parse({
        score: 80,
        confidence: 1.1,
        keyFindings: ["x"],
      }),
    ).toThrow();
  });

  it("rejects decimal score", () => {
    expect(() =>
      BaseEvaluationSchema.parse({
        score: 85.5,
        confidence: 0.9,
        keyFindings: ["x"],
      }),
    ).toThrow();
  });

  it("defaults keyFindings to empty array when omitted", () => {
    const parsed = BaseEvaluationSchema.parse({
      score: 75,
      confidence: 0.8,
      feedback: "Evaluation narrative for this dimension.",
    });

    expect(parsed.keyFindings).toEqual([]);
    expect(parsed.risks).toEqual([]);
    expect(parsed.dataGaps).toEqual([]);
    expect(parsed.sources).toEqual([]);
  });

  it("defaults all optional arrays independently", () => {
    const parsed = BaseEvaluationSchema.parse({
      score: 60,
      confidence: 0.5,
      feedback: "Evaluation narrative for this dimension.",
      keyFindings: ["Finding 1"],
    });

    expect(parsed.keyFindings).toEqual(["Finding 1"]);
    expect(parsed.risks).toEqual([]);
    expect(parsed.dataGaps).toEqual([]);
    expect(parsed.sources).toEqual([]);
  });

  it("accepts optional narrative fields", () => {
    const parsed = BaseEvaluationSchema.parse({
      score: 78,
      confidence: 0.6,
      feedback: "Concise evaluator summary.",
      narrativeSummary:
        "Paragraph one.\n\nParagraph two.\n\nParagraph three.",
      memoNarrative:
        "Paragraph one.\n\nParagraph two.\n\nParagraph three.",
    });

    expect(parsed.narrativeSummary).toContain("Paragraph one.");
    expect(parsed.memoNarrative).toContain("Paragraph one.");
  });

  it("treats null narrative fields as undefined", () => {
    const parsed = BaseEvaluationSchema.parse({
      score: 66,
      confidence: 0.5,
      feedback: "Summary",
      narrativeSummary: null,
      memoNarrative: null,
    });

    expect(parsed.narrativeSummary).toBeUndefined();
    expect(parsed.memoNarrative).toBeUndefined();
  });
});
