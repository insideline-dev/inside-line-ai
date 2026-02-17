import { describe, expect, it } from "bun:test";
import { DealTermsEvaluationSchema } from "./deal-terms.schema";
import { MarketEvaluationSchema } from "./market.schema";
import { TractionEvaluationSchema } from "./traction.schema";
import { CompetitiveAdvantageEvaluationSchema } from "./competitive-advantage.schema";
import { FinancialsEvaluationSchema } from "./financials.schema";

const base = {
  score: 80,
  confidence: 0.7,
  feedback: "Solid assessment with minor gaps.",
  keyFindings: [],
  risks: [],
  dataGaps: [],
  sources: [],
};

describe("evaluation schema null tolerance", () => {
  it("accepts null optional numeric values in deal terms", () => {
    const parsed = DealTermsEvaluationSchema.parse({
      ...base,
      valuation: null,
      askAmount: null,
      equity: null,
      termsQuality: "Standard terms for stage.",
    });

    expect(parsed.valuation).toBeUndefined();
    expect(parsed.askAmount).toBeUndefined();
    expect(parsed.equity).toBeUndefined();
  });

  it("accepts null optional values in market details", () => {
    const parsed = MarketEvaluationSchema.parse({
      ...base,
      marketSize: "Large global market",
      marketGrowth: "Growing steadily",
      tamEstimate: null,
      marketTiming: "Strong tailwinds",
      credibilityScore: 70,
      directCompetitorsDetailed: [
        {
          name: "Competitor A",
          description: "Direct competitor",
          url: null,
          fundingRaised: null,
        },
      ],
      indirectCompetitorsDetailed: [
        {
          name: "Alternative B",
          description: "Indirect competitor",
          whyIndirect: null,
          url: null,
          threatLevel: null,
        },
      ],
    });

    expect(parsed.tamEstimate).toBeUndefined();
    expect(parsed.directCompetitorsDetailed[0]?.url).toBeUndefined();
    expect(parsed.directCompetitorsDetailed[0]?.fundingRaised).toBeUndefined();
    expect(parsed.indirectCompetitorsDetailed[0]?.whyIndirect).toBeUndefined();
    expect(parsed.indirectCompetitorsDetailed[0]?.url).toBeUndefined();
    expect(parsed.indirectCompetitorsDetailed[0]?.threatLevel).toBeUndefined();
  });

  it("accepts null metrics in traction", () => {
    const parsed = TractionEvaluationSchema.parse({
      ...base,
      metrics: {
        users: null,
        revenue: null,
        growthRatePct: null,
      },
      customerValidation: "Early customer interviews completed.",
      growthTrajectory: "Early but improving.",
      revenueModel: "Subscription.",
    });

    expect(parsed.metrics.users).toBeUndefined();
    expect(parsed.metrics.revenue).toBeUndefined();
    expect(parsed.metrics.growthRatePct).toBeUndefined();
  });

  it("accepts null optional values in competitive advantage details", () => {
    const parsed = CompetitiveAdvantageEvaluationSchema.parse({
      ...base,
      competitivePosition: "Differentiated via workflow automation.",
      directCompetitorsDetailed: [
        {
          name: "Competitor C",
          description: "Direct competitor",
          url: null,
          fundingRaised: null,
        },
      ],
      indirectCompetitorsDetailed: [
        {
          name: "Alternative D",
          description: "Indirect competitor",
          whyIndirect: null,
          url: null,
          threatLevel: null,
        },
      ],
    });

    expect(parsed.directCompetitorsDetailed[0]?.url).toBeUndefined();
    expect(parsed.directCompetitorsDetailed[0]?.fundingRaised).toBeUndefined();
    expect(parsed.indirectCompetitorsDetailed[0]?.whyIndirect).toBeUndefined();
    expect(parsed.indirectCompetitorsDetailed[0]?.url).toBeUndefined();
    expect(parsed.indirectCompetitorsDetailed[0]?.threatLevel).toBeUndefined();
  });

  it("accepts null optional values in financials", () => {
    const parsed = FinancialsEvaluationSchema.parse({
      ...base,
      burnRate: null,
      runway: null,
      fundingHistory: [
        {
          round: "Seed",
          amount: 1000000,
          date: null,
        },
      ],
      financialHealth: "No major concerns at this stage.",
    });

    expect(parsed.burnRate).toBeUndefined();
    expect(parsed.runway).toBeUndefined();
    expect(parsed.fundingHistory[0]?.date).toBeUndefined();
  });
});
