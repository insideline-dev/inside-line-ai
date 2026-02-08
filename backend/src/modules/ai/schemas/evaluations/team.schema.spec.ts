import { describe, expect, it } from "bun:test";
import { TeamEvaluationSchema } from "./team.schema";

describe("TeamEvaluationSchema", () => {
  const valid = {
    score: 85,
    confidence: 0.9,
    keyFindings: ["Strong technical team"],
    risks: ["No dedicated sales leader"],
    dataGaps: [],
    sources: ["https://example.com"],
    founderQuality: "Strong",
    teamCompletion: 75,
    executionCapability: "High",
    founderMarketFitScore: 80,
    teamMembers: [
      {
        name: "John Doe",
        role: "CEO",
        background: "Ex-Google",
        strengths: ["Leadership"],
        concerns: [],
      },
    ],
  };

  it("parses valid team evaluation", () => {
    const parsed = TeamEvaluationSchema.parse(valid);
    expect(parsed.score).toBe(85);
    expect(parsed.teamMembers).toHaveLength(1);
  });

  it("rejects invalid teamCompletion", () => {
    expect(() =>
      TeamEvaluationSchema.parse({
        ...valid,
        teamCompletion: 120,
      }),
    ).toThrow();
  });

  it("requires teamMembers", () => {
    expect(() =>
      TeamEvaluationSchema.parse({
        ...valid,
        teamMembers: [],
      }),
    ).toThrow();
  });
});
