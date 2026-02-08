import { describe, expect, it } from "bun:test";
import { BaseEvaluationSchema } from "./base-evaluation.schema";

describe("BaseEvaluationSchema", () => {
  it("parses valid data", () => {
    const parsed = BaseEvaluationSchema.parse({
      score: 85,
      confidence: 0.9,
      keyFindings: ["Strong team"],
      risks: [],
      dataGaps: [],
      sources: [],
    });

    expect(parsed.score).toBe(85);
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
});
