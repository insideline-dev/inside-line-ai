import { describe, expect, it } from "bun:test";
import {
  CompetitorResearchSchema,
  CompetitorDetailSchema,
  IndirectCompetitorDetailSchema,
} from "./competitor-research.schema";

describe("CompetitorResearchSchema", () => {
  it("parses valid competitor research data", () => {
    const parsed = CompetitorResearchSchema.parse({
      competitors: [
        {
          name: "RivalCo",
          description: "Main competitor in vertical",
          website: "https://rivalco.example.com",
          fundingRaised: 30_000_000,
          fundingStage: "Series B",
          employeeCount: 150,
          productOverview: "Enterprise workflow automation platform",
          keyFeatures: ["Drag-and-drop builder", "API integrations"],
          pricing: "Enterprise annual contracts",
          targetMarket: "Mid-market and enterprise",
          differentiators: ["Larger ecosystem"],
          weaknesses: ["Not AI-native"],
          threatLevel: "high",
        },
      ],
      indirectCompetitors: [
        {
          name: "ERP Extensions",
          description: "Custom ERP workflow modules",
          whyIndirect: "Competes for same budget",
          threatLevel: "medium",
        },
      ],
      marketPositioning: "Vertical AI-native specialist",
      competitiveLandscapeSummary: "Fragmented with horizontal incumbents",
      sources: ["https://crunchbase.com/rivalco"],
    });

    expect(parsed.competitors).toHaveLength(1);
    expect(parsed.competitors[0].threatLevel).toBe("high");
    expect(parsed.indirectCompetitors).toHaveLength(1);
    expect(parsed.marketPositioning).toBe("Vertical AI-native specialist");
  });

  it("defaults array fields to empty arrays when omitted", () => {
    const parsed = CompetitorResearchSchema.parse({});

    expect(parsed.competitors).toEqual([]);
    expect(parsed.indirectCompetitors).toEqual([]);
    expect(parsed.sources).toEqual([]);
    expect(parsed.marketPositioning).toBe("");
    expect(parsed.competitiveLandscapeSummary).toBe("");
  });

  it("normalizes rich competitor payloads into canonical schema output", () => {
    const parsed = CompetitorResearchSchema.parse({
      competitorIdentification: {
        directCompetitors: [
          {
            name: "MaxAB",
            website: "https://maxab.io/",
            reasoning: "Direct B2B FMCG e-commerce competitor in North Africa.",
          },
          {
            name: "Wasoko",
            website: "https://wasoko.com/",
            reasoning: "Pan-African B2B retail platform.",
          },
        ],
        indirectCompetitors: [
          {
            name: "WafR",
            website: "https://wafr.ma/",
            reasoning: "Loyalty/discount product serving similar retailers.",
          },
        ],
        emergingThreats: [
          {
            name: "Retailo",
            website: "https://retailo.co/",
            reasoning: "Fast-growing MENA player that could enter market.",
          },
        ],
      },
      competitorProfiles: [
        {
          name: "MaxAB",
          funding: {
            totalRaised: "100000000",
            lastRound: "Series B",
            keyInvestors: ["Silver Lake"],
          },
          team: {
            size: "500-1000",
            hiringVelocity: "Moderate",
          },
          product: {
            coreFeatures: ["B2B Marketplace", "Embedded Finance"],
            techApproach: "Supply-chain software and forecasting",
            recentLaunches: "Expanded credit facilities",
          },
          pricing: {
            model: "Markup",
            tiers: "Unknown",
          },
          positioning: {
            messaging: "Supply chain efficiency for traditional retail.",
          },
          traction: {
            metrics: "Serves 150,000+ retailers.",
          },
        },
      ],
      featureComparisonMatrix: [
        { feature: "Embedded BNPL", startup: "Full Support", maxAB: "Full Support" },
      ],
      competitiveDynamics: {
        marketShareSignals: [{ evidence: "Competes in Morocco" }],
        barriersToEntry: [{ evidence: "Logistics CAPEX" }],
      },
      sources: ["https://maxab.io/", "https://wasoko.com/"],
    });

    expect(parsed.competitors).toHaveLength(2);
    expect(parsed.competitors[0].name).toBe("MaxAB");
    expect(parsed.competitors[0].pricing).toContain("Markup");
    expect(parsed.competitors[0].fundingRaised).toBe(100_000_000);
    expect(parsed.competitors[0].employeeCount).toBeUndefined();
    expect(parsed.indirectCompetitors.map((c) => c.name)).toEqual(["WafR", "Retailo"]);
    expect(parsed.marketPositioning).toContain("MaxAB");
    expect(parsed.competitiveLandscapeSummary).toContain("direct competitor");
    expect(parsed.sources).toEqual(["https://maxab.io/", "https://wasoko.com/"]);
  });

  it("defaults competitor sub-arrays when omitted", () => {
    const parsed = CompetitorDetailSchema.parse({
      name: "Rival",
      description: "A rival",
      productOverview: "Their product",
    });

    expect(parsed.keyFeatures).toEqual([]);
    expect(parsed.differentiators).toEqual([]);
    expect(parsed.weaknesses).toEqual([]);
  });

  it("rejects invalid website URL", () => {
    expect(() =>
      CompetitorDetailSchema.parse({
        name: "Bad",
        description: "Bad URL",
        productOverview: "Overview",
        website: "not-a-url",
      }),
    ).toThrow();
  });

  it("allows optional fields on competitor", () => {
    const parsed = CompetitorDetailSchema.parse({
      name: "Minimal",
      description: "Minimal competitor",
      productOverview: "Basic product",
    });

    expect(parsed.website).toBeUndefined();
    expect(parsed.fundingRaised).toBeUndefined();
    expect(parsed.fundingStage).toBeUndefined();
    expect(parsed.employeeCount).toBeUndefined();
    expect(parsed.pricing).toBeUndefined();
    expect(parsed.targetMarket).toBeUndefined();
    expect(parsed.threatLevel).toBeUndefined();
  });

  it("coerces object pricing to a string", () => {
    const parsed = CompetitorDetailSchema.parse({
      name: "PricingCo",
      description: "Returns structured pricing payload",
      productOverview: "Platform",
      pricing: {
        model: "transaction_fee",
        range: "$10-$50",
      },
    });

    expect(typeof parsed.pricing).toBe("string");
    expect(parsed.pricing).toContain("transaction_fee");
    expect(parsed.pricing).toContain("$10-$50");
  });

  it("treats null optional values as undefined", () => {
    const parsed = CompetitorDetailSchema.parse({
      name: "NullCo",
      description: "Null-friendly payload",
      website: null,
      fundingRaised: null,
      fundingStage: null,
      employeeCount: null,
      pricing: null,
      targetMarket: null,
      threatLevel: null,
      productOverview: "Core product",
    });

    expect(parsed.website).toBeUndefined();
    expect(parsed.fundingRaised).toBeUndefined();
    expect(parsed.fundingStage).toBeUndefined();
    expect(parsed.employeeCount).toBeUndefined();
    expect(parsed.pricing).toBeUndefined();
    expect(parsed.targetMarket).toBeUndefined();
    expect(parsed.threatLevel).toBeUndefined();
  });
});

describe("IndirectCompetitorDetailSchema", () => {
  it("parses valid indirect competitor", () => {
    const parsed = IndirectCompetitorDetailSchema.parse({
      name: "Substitute",
      description: "Alternative approach",
      whyIndirect: "Adjacent market overlap",
      threatLevel: "low",
      website: "https://substitute.example.com",
    });

    expect(parsed.name).toBe("Substitute");
    expect(parsed.whyIndirect).toBe("Adjacent market overlap");
  });

  it("defaults missing whyIndirect field", () => {
    const parsed = IndirectCompetitorDetailSchema.parse({
      name: "NoWhy",
      description: "Missing whyIndirect",
    });

    expect(parsed.whyIndirect).toBe("Indirect relationship not specified");
  });
});
