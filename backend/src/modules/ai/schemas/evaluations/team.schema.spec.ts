import { describe, expect, it } from "bun:test";
import { TeamEvaluationSchema } from "./team.schema";

describe("TeamEvaluationSchema", () => {
  const valid = {
    score: 85,
    confidence: 0.9,
    feedback: "The founding team demonstrates strong technical depth with complementary skill sets across engineering and product. The CEO brings prior startup experience and domain expertise that aligns well with the target market.",
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

  it("defaults teamMembers to empty array when omitted", () => {
    const { teamMembers: _, ...withoutMembers } = valid;
    const parsed = TeamEvaluationSchema.parse(withoutMembers);
    expect(parsed.teamMembers).toEqual([]);
  });

  it("defaults nested arrays in teamMembers", () => {
    const parsed = TeamEvaluationSchema.parse({
      ...valid,
      teamMembers: [
        {
          name: "Alice",
          role: "CTO",
          background: "Ex-Meta",
        },
      ],
    });

    expect(parsed.teamMembers[0]?.strengths).toEqual([]);
    expect(parsed.teamMembers[0]?.concerns).toEqual([]);
  });
});
