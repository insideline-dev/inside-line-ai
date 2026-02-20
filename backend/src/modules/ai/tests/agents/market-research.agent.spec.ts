import { describe, expect, it } from "bun:test";
import { MarketResearchAgent } from "../../agents/research/market-research.agent";
import type { ResearchPipelineInput } from "../../interfaces/agent.interface";

const pipelineInput: ResearchPipelineInput = {
  extraction: {
    companyName: "Inside Line",
    tagline: "AI startup diligence",
    founderNames: ["Alex Founder"],
    industry: "SaaS",
    stage: "seed",
    location: "San Francisco, CA",
    website: "https://inside-line.test",
    fundingAsk: 1_500_000,
    rawText: "Inside Line automates startup diligence workflows.",
  },
  scraping: {
    websiteUrl: "https://inside-line.test",
    websiteSummary: "AI diligence workspace",
    website: null,
    teamMembers: [{ name: "Alex Founder", role: "CEO", linkedinUrl: "https://linkedin.com/in/alex-founder" }],
    notableClaims: ["B2B SaaS"],
    scrapeErrors: [],
  },
};

describe("MarketResearchAgent", () => {
  it("builds market-only context and excludes team/product-heavy fields", () => {
    const context = MarketResearchAgent.contextBuilder(pipelineInput);

    expect(Object.keys(context).sort()).toEqual([
      "businessModel",
      "claimedGrowthRate",
      "claimedTam",
      "companyDescription",
      "geographicFocus",
      "industry",
      "targetCustomers",
      "targetMarket",
    ]);
    expect(context).not.toHaveProperty("teamMembers");
    expect(context).not.toHaveProperty("linkedinProfiles");
    expect(context).not.toHaveProperty("productDescription");
    expect(context.targetCustomers).toBeUndefined();
    expect(context.claimedTam).toBeUndefined();
    expect(context.claimedGrowthRate).toBeUndefined();
    expect(context.businessModel).toBeUndefined();
  });

  it("uses researchParameters when available", () => {
    const inputWithParams: ResearchPipelineInput = {
      ...pipelineInput,
      researchParameters: {
        companyName: "Inside Line",
        sector: "SaaS",
        specificMarket: "AI-powered startup diligence",
        productDescription: "Automated VC due diligence platform",
        targetCustomers: "Venture capital firms",
        knownCompetitors: ["Harmonic", "Sourcescrub"],
        geographicFocus: "United States",
        businessModel: "SaaS subscription",
        fundingStage: "seed",
        teamMembers: [],
        claimedMetrics: { tam: "$5B", growthRate: "25% CAGR" },
      },
    };
    const context = MarketResearchAgent.contextBuilder(inputWithParams);

    expect(context.geographicFocus).toBe("United States");
    expect(context.targetMarket).toBe("AI-powered startup diligence");
    expect(context.targetCustomers).toBe("Venture capital firms");
    expect(context.claimedTam).toBe("$5B");
    expect(context.claimedGrowthRate).toBe("25% CAGR");
    expect(context.businessModel).toBe("SaaS subscription");
  });
});
