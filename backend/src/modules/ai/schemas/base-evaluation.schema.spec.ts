import { describe, expect, it } from "bun:test";
import { BaseEvaluationSchema } from "./base-evaluation.schema";

describe("BaseEvaluationSchema", () => {
  it("parses valid data with string confidence", () => {
    const parsed = BaseEvaluationSchema.parse({
      score: 85,
      confidence: "high",
      narrativeSummary: "The team demonstrates strong execution capability with proven domain expertise.",
      keyFindings: ["Strong team"],
      risks: [],
      dataGaps: [],
      sources: [],
    });

    expect(parsed.score).toBe(85);
    expect(parsed.confidence).toBe("high");
    expect(parsed.narrativeSummary).toBeTruthy();
  });

  it("coerces legacy float confidence >= 0.7 to 'high'", () => {
    const parsed = BaseEvaluationSchema.parse({
      score: 80,
      confidence: 0.9,
      narrativeSummary: "Solid evaluation.",
    });

    expect(parsed.confidence).toBe("high");
  });

  it("coerces legacy float confidence 0.4-0.69 to 'mid'", () => {
    const parsed = BaseEvaluationSchema.parse({
      score: 70,
      confidence: 0.5,
      narrativeSummary: "Partial evidence.",
    });

    expect(parsed.confidence).toBe("mid");
  });

  it("normalizes legacy 'medium' confidence string to 'mid'", () => {
    const parsed = BaseEvaluationSchema.parse({
      score: 72,
      confidence: "medium",
      narrativeSummary: "Legacy confidence label.",
    });

    expect(parsed.confidence).toBe("mid");
  });

  it("coerces legacy float confidence < 0.4 to 'low'", () => {
    const parsed = BaseEvaluationSchema.parse({
      score: 50,
      confidence: 0.2,
      narrativeSummary: "Limited data.",
    });

    expect(parsed.confidence).toBe("low");
  });

  it("rejects invalid scores", () => {
    expect(() =>
      BaseEvaluationSchema.parse({
        score: -1,
        confidence: "high",
        narrativeSummary: "x",
        keyFindings: ["x"],
      }),
    ).toThrow();

    expect(() =>
      BaseEvaluationSchema.parse({
        score: 101,
        confidence: "high",
        narrativeSummary: "x",
        keyFindings: ["x"],
      }),
    ).toThrow();
  });

  it("rejects invalid confidence string", () => {
    expect(() =>
      BaseEvaluationSchema.parse({
        score: 80,
        confidence: "very_high",
        narrativeSummary: "x",
        keyFindings: ["x"],
      }),
    ).toThrow();
  });

  it("rejects decimal score", () => {
    expect(() =>
      BaseEvaluationSchema.parse({
        score: 85.5,
        confidence: "mid",
        narrativeSummary: "x",
        keyFindings: ["x"],
      }),
    ).toThrow();
  });

  it("defaults keyFindings, risks, dataGaps, sources to empty array when omitted", () => {
    const parsed = BaseEvaluationSchema.parse({
      score: 75,
      confidence: "mid",
      narrativeSummary: "Evaluation narrative for this dimension.",
    });

    expect(parsed.keyFindings).toEqual([]);
    expect(parsed.risks).toEqual([]);
    expect(parsed.dataGaps).toEqual([]);
    expect(parsed.sources).toEqual([]);
  });

  it("defaults all optional arrays independently", () => {
    const parsed = BaseEvaluationSchema.parse({
      score: 60,
      confidence: "low",
      narrativeSummary: "Evaluation narrative for this dimension.",
      keyFindings: ["Finding 1"],
    });

    expect(parsed.keyFindings).toEqual(["Finding 1"]);
    expect(parsed.risks).toEqual([]);
    expect(parsed.dataGaps).toEqual([]);
    expect(parsed.sources).toEqual([]);
  });

  it("accepts narrativeSummary as required string", () => {
    const parsed = BaseEvaluationSchema.parse({
      score: 78,
      confidence: "mid",
      narrativeSummary: "Paragraph one.\n\nParagraph two.\n\nParagraph three.",
    });

    expect(parsed.narrativeSummary).toContain("Paragraph one.");
  });

  it("treats null narrativeSummary as fallback default string", () => {
    const parsed = BaseEvaluationSchema.parse({
      score: 66,
      confidence: "low",
      narrativeSummary: null,
    });

    expect(typeof parsed.narrativeSummary).toBe("string");
    expect(parsed.narrativeSummary.length).toBeGreaterThan(0);
  });

  it("treats empty string narrativeSummary as fallback default string", () => {
    const parsed = BaseEvaluationSchema.parse({
      score: 66,
      confidence: "low",
      narrativeSummary: "",
    });

    expect(typeof parsed.narrativeSummary).toBe("string");
    expect(parsed.narrativeSummary.length).toBeGreaterThan(0);
  });
});
