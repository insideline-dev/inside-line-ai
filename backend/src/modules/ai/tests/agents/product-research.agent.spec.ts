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
      "demoUrl",
      "knownCompetitors",
      "productDescription",
      "websiteHeadings",
      "websiteProductPages",
    ]);
    expect(context).not.toHaveProperty("teamMembers");
    expect(context).not.toHaveProperty("claimedTAM");
    expect(context).not.toHaveProperty("knownFunding");
  });
});
