import { describe, expect, it } from "bun:test";
import { DealTermsEvaluationSchema } from "./deal-terms.schema";
import { MarketEvaluationSchema } from "./market.schema";
import { TractionEvaluationSchema } from "./traction.schema";
import { CompetitiveAdvantageEvaluationSchema } from "./competitive-advantage.schema";
import { FinancialsEvaluationSchema } from "./financials.schema";

const base = {
  score: 80,
  confidence: "mid",
  narrativeSummary: "Solid assessment with minor gaps.",
  keyFindings: [],
  risks: [],
  dataGaps: [],
  sources: [],
};

describe("evaluation schema null tolerance", () => {
  it("accepts null optional scalar values in deal terms", () => {
    const parsed = DealTermsEvaluationSchema.parse({
      ...base,
      dealOverview: {
        impliedMultiple: null,
        comparableRange: null,
        premiumDiscount: "insufficient_data",
        roundType: "SAFE",
        raiseSizeAssessment: "insufficient_data",
        valuationProvided: false,
      },
    });

    expect(parsed.dealOverview.impliedMultiple).toBeNull();
    expect(parsed.dealOverview.comparableRange).toBeNull();
  });

  it("accepts minimal market evaluation and applies top-level defaults", () => {
    const parsed = MarketEvaluationSchema.parse({ ...base });

    // New schema uses marketSizing, marketGrowthAndTiming, marketStructure
    expect(parsed.marketSizing).toBeDefined();
    expect(parsed.marketGrowthAndTiming).toBeDefined();
    expect(parsed.marketStructure).toBeDefined();
    expect(parsed.diligenceItems).toEqual([]);
    expect(parsed.founderPitchRecommendations).toEqual([]);
  });

  it("market schema accepts null/missing nested objects and falls back to defaults", () => {
    const parsed = MarketEvaluationSchema.parse({
      ...base,
      marketSizing: null,
      marketGrowthAndTiming: null,
      marketStructure: null,
    });

    expect(parsed.marketSizing.tam.value).toBeDefined();
    expect(parsed.marketGrowthAndTiming.timingAssessment).toBeDefined();
    expect(parsed.marketStructure.structureType).toBeDefined();
  });

  it("traction schema defaults archive overview fields", () => {
    const parsed = TractionEvaluationSchema.parse({ ...base });

    expect(parsed.score).toBe(80);
    expect(parsed.confidence).toBe("mid");
    expect(parsed.narrativeSummary).toBeTruthy();
    expect(parsed.tractionOverview.metricsDepth).toBeDefined();
  });

  it("traction schema rejects invalid score", () => {
    expect(() =>
      TractionEvaluationSchema.parse({ ...base, score: 999 }),
    ).toThrow();
  });

  it("competitive advantage accepts minimal data and defaults all sub-schemas", () => {
    const parsed = CompetitiveAdvantageEvaluationSchema.parse({ ...base });

    expect(parsed.strategicPositioning).toBeDefined();
    expect(parsed.moatAssessment).toBeDefined();
    expect(parsed.barriersToEntry).toBeDefined();
    expect(parsed.competitivePosition).toBeDefined();
    expect(parsed.competitors).toBeDefined();
    expect(parsed.competitors.direct).toEqual([]);
    expect(parsed.competitors.indirect).toEqual([]);
  });

  it("competitive advantage accepts null optional values in competitors", () => {
    const parsed = CompetitiveAdvantageEvaluationSchema.parse({
      ...base,
      competitors: {
        direct: [
          {
            name: "Competitor C",
            description: "Direct competitor",
            url: null,
            fundingRaised: null,
          },
        ],
        indirect: [
          {
            name: "Alternative D",
            description: "Indirect competitor",
            whyIndirect: null,
            url: null,
            threatLevel: null,
          },
        ],
      },
    });

    expect(parsed.competitors.direct[0]?.url).toBeUndefined();
    expect(parsed.competitors.direct[0]?.fundingRaised).toBeUndefined();
    expect(parsed.competitors.indirect[0]?.whyIndirect).toBeUndefined();
    expect(parsed.competitors.indirect[0]?.url).toBeUndefined();
    expect(parsed.competitors.indirect[0]?.threatLevel).toBeUndefined();
  });

  it("financials schema defaults archive financial structures", () => {
    const parsed = FinancialsEvaluationSchema.parse({ ...base });

    expect(parsed.score).toBe(80);
    expect(parsed.confidence).toBe("mid");
    expect(parsed.keyMetrics.raiseAmount).toBeNull();
    expect(parsed.capitalPlan.summary.length).toBeGreaterThan(0);
  });

  it("financials schema accepts founderPitchRecommendations", () => {
    const parsed = FinancialsEvaluationSchema.parse({
      ...base,
      founderPitchRecommendations: [
        {
          deckMissingElement: "Financial projections",
          whyItMatters: "Investors need to see unit economics",
          recommendation: "Add a 3-year P&L projection slide",
        },
      ],
    });

    expect(parsed.founderPitchRecommendations).toHaveLength(1);
    expect(parsed.founderPitchRecommendations[0]?.deckMissingElement).toBe("Financial projections");
  });
});
