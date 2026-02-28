import { describe, expect, it } from "bun:test";
import { ProductResearchAgent } from "../../agents/research/product-research.agent";
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
    website: {
      url: "https://inside-line.test/",
      title: "Inside Line",
      description: "AI diligence workspace",
      fullText: "Product and feature pages",
      headings: ["Features", "Pricing"],
      subpages: [
        { url: "https://inside-line.test/product", title: "Product", content: "Automation" },
        { url: "https://inside-line.test/features", title: "Features", content: "Signals" },
      ],
      links: [],
      teamBios: [],
      customerLogos: [],
      testimonials: [],
      metadata: {
        scrapedAt: new Date().toISOString(),
        pageCount: 3,
        hasAboutPage: false,
        hasTeamPage: false,
        hasPricingPage: true,
      },
    },
    teamMembers: [{ name: "Alex Founder", role: "CEO", linkedinUrl: "https://linkedin.com/in/alex-founder" }],
    notableClaims: ["B2B SaaS"],
    scrapeErrors: [],
  },
};

describe("ProductResearchAgent", () => {
  it("builds product-only context and excludes team/market/news fields", () => {
    const context = ProductResearchAgent.contextBuilder(pipelineInput);

    expect(Object.keys(context).sort()).toEqual([
      "businessModel",
      "demoUrl",
      "knownCompetitors",
      "productDescription",
      "specificMarket",
      "websiteHeadings",
      "websiteProductPages",
    ]);
    expect(context).not.toHaveProperty("teamMembers");
    expect(context).not.toHaveProperty("claimedTAM");
    expect(context).not.toHaveProperty("knownFunding");
    expect(context.businessModel).toBeUndefined();
    expect(context.specificMarket).toBeUndefined();
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
    const context = ProductResearchAgent.contextBuilder(inputWithParams);

    expect(context.productDescription).toBe("Automated VC due diligence platform");
    expect(context.knownCompetitors).toEqual(["Harmonic", "Sourcescrub"]);
    expect(context.businessModel).toBe("SaaS subscription");
    expect(context.specificMarket).toBe("AI-powered startup diligence");
  });

  it("falls back to startup form productDescription when researchParameters value is empty", () => {
    const inputWithEmptyProductDescription: ResearchPipelineInput = {
      ...pipelineInput,
      extraction: {
        ...pipelineInput.extraction,
        startupContext: {
          productDescription: "Startup form product description",
        },
      },
      researchParameters: {
        companyName: "Inside Line",
        sector: "SaaS",
        specificMarket: "AI-powered startup diligence",
        productDescription: "",
        targetCustomers: "Venture capital firms",
        knownCompetitors: ["Harmonic", "Sourcescrub"],
        geographicFocus: "United States",
        businessModel: "SaaS subscription",
        fundingStage: "seed",
        teamMembers: [],
        claimedMetrics: { tam: "$5B", growthRate: "25% CAGR" },
      },
    };

    const context = ProductResearchAgent.contextBuilder(inputWithEmptyProductDescription);

    expect(context.productDescription).toBe("Startup form product description");
  });
});
