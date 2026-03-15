import { describe, expect, it } from "bun:test";
import { zodResponseFormat } from "openai/helpers/zod";
import { MarketEvaluationSchema } from "./market.schema";

describe("MarketEvaluationSchema", () => {
  it("uses an OpenAI-strict schema for nested market sizing structured output", () => {
    expect(() => zodResponseFormat(MarketEvaluationSchema, "response")).not.toThrow();
  });

  it("normalizes missing nested market sizing values to safe defaults", () => {
    const parsed = MarketEvaluationSchema.parse({
      score: 38,
      confidence: "low",
      narrativeSummary: "Fallback market evaluation.",
      keyFindings: [],
      risks: [],
      dataGaps: [],
      sources: [],
      marketSizing: {
        tam: {},
        sam: {},
        som: {},
        bottomUpSanityCheck: {},
        deckVsResearch: {},
      },
      marketGrowthAndTiming: {
        growthRate: {},
        whyNow: {},
        marketLifecycle: {},
      },
      marketStructure: {
        concentrationTrend: {},
      },
    });

    expect(parsed.marketSizing.tam.methodology).toBe("top-down");
    expect(parsed.marketSizing.tam.confidence).toBe("low");
    expect(parsed.marketGrowthAndTiming.growthRate.trajectory).toBe("stable");
    expect(parsed.marketGrowthAndTiming.whyNow.supportedByResearch).toBe(false);
    expect(parsed.marketStructure.structureType).toBe("emerging");
    expect(parsed.marketStructure.entryConditions).toEqual([]);
  });

  it("accepts fallback-style market output with no nested market objects", () => {
    const parsed = MarketEvaluationSchema.parse({
      score: 25,
      confidence: "low",
      narrativeSummary: "Market evaluation incomplete — requires manual review",
      keyFindings: [],
      risks: [],
      dataGaps: [],
      sources: [],
      diligenceItems: [],
      founderPitchRecommendations: [],
    });

    expect(parsed.marketSizing.tam.value).toBe("Unknown");
    expect(parsed.marketGrowthAndTiming.whyNow.supportedByResearch).toBe(false);
    expect(parsed.marketStructure.concentrationTrend.direction).toBe("stable");
  });
});
