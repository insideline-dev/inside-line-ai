import { describe, expect, it } from "bun:test";
import { TeamEvaluationSchema } from "./team.schema";

describe("TeamEvaluationSchema", () => {
  const valid = {
    score: 85,
    confidence: "high",
    narrativeSummary: "The founding team demonstrates strong technical depth with complementary skill sets across engineering and product. The CEO brings prior startup experience and domain expertise that aligns well with the target market.",
    keyFindings: ["Strong technical team"],
    risks: ["No dedicated sales leader"],
    dataGaps: [],
    sources: ["https://example.com"],
    founderMarketFit: {
      score: 80,
      why: "Founder has 10 years in the target industry with direct buyer relationships.",
    },
    strengths: ["Domain expertise", "Prior exit"],
    teamMembers: [
      {
        name: "John Doe",
        role: "CEO",
        background: "Ex-Google",
        strengths: ["Leadership"],
        concerns: [],
      },
    ],
    founderRecommendations: [],
    founderPitchRecommendations: [],
    teamComposition: {
      businessLeadership: true,
      technicalCapability: true,
      domainExpertise: true,
      gtmCapability: false,
      sentence: "Founders cover leadership, product, and technical capabilities with partial GTM support.",
      reason: "No dedicated GTM hire yet.",
    },
  };

  it("parses valid team evaluation", () => {
    const parsed = TeamEvaluationSchema.parse(valid);
    expect(parsed.score).toBe(85);
    expect(parsed.teamMembers).toHaveLength(1);
  });

  it("parses with new founderMarketFit object", () => {
    const parsed = TeamEvaluationSchema.parse(valid);
    expect(parsed.founderMarketFit.score).toBe(80);
    expect(typeof parsed.founderMarketFit.why).toBe("string");
    expect(parsed.teamComposition.businessLeadership).toBe(true);
  });

  it("defaults founderMarketFit when omitted", () => {
    const { founderMarketFit: _, ...withoutFit } = valid;
    const parsed = TeamEvaluationSchema.parse(withoutFit);
    expect(typeof parsed.founderMarketFit.score).toBe("number");
    expect(typeof parsed.founderMarketFit.why).toBe("string");
  });

  it("defaults teamComposition when omitted", () => {
    const { teamComposition: _, ...withoutCoverage } = valid;
    const parsed = TeamEvaluationSchema.parse(withoutCoverage);
    expect(parsed.teamComposition.businessLeadership).toBe(false);
    expect(parsed.teamComposition.technicalCapability).toBe(false);
    expect(parsed.teamComposition.sentence.length).toBeGreaterThan(0);
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

  it("defaults strengths to empty array when omitted", () => {
    const { strengths: _, ...withoutStrengths } = valid;
    const parsed = TeamEvaluationSchema.parse(withoutStrengths);
    expect(parsed.strengths).toEqual([]);
  });

  it("rejects founderMarketFit score out of range", () => {
    expect(() =>
      TeamEvaluationSchema.parse({
        ...valid,
        founderMarketFit: { score: 150, why: "Extreme score" },
      }),
    ).toThrow();
  });

  it("coerces legacy float confidence to enum string", () => {
    const parsed = TeamEvaluationSchema.parse({
      ...valid,
      confidence: 0.85,
    });
    expect(parsed.confidence).toBe("high");
  });

  it("normalizes legacy medium confidence to mid", () => {
    const parsed = TeamEvaluationSchema.parse({
      ...valid,
      confidence: "medium",
    });
    expect(parsed.confidence).toBe("mid");
  });
});
