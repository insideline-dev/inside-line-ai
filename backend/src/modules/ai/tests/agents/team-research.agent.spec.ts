import { describe, expect, it } from "bun:test";
import { TeamResearchAgent } from "../../agents/research/team-research.agent";
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

describe("TeamResearchAgent", () => {
  it("builds focused team context with no unrelated market/product fields", () => {
    const context = TeamResearchAgent.contextBuilder(pipelineInput);

    expect(Object.keys(context).sort()).toEqual([
      "companyDescription",
      "companyName",
      "industry",
      "teamMembers",
      "websiteUrl",
    ]);
    expect(context).not.toHaveProperty("claimedTAM");
    expect(context).not.toHaveProperty("productDescription");
    expect(context).not.toHaveProperty("knownFunding");
  });
});
