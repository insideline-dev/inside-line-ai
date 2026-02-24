import { describe, expect, it } from "bun:test";
import { MARKET_RESEARCH_SYSTEM_PROMPT } from "../../prompts/research/market-research.prompt";
import { PRODUCT_RESEARCH_SYSTEM_PROMPT } from "../../prompts/research/product-research.prompt";
import { TEAM_RESEARCH_SYSTEM_PROMPT } from "../../prompts/research/team-research.prompt";
import { NEWS_RESEARCH_SYSTEM_PROMPT } from "../../prompts/research/news-research.prompt";
import { COMPETITOR_RESEARCH_SYSTEM_PROMPT } from "../../prompts/research/competitor-research.prompt";

describe("Research prompt contracts", () => {
  it("market prompt includes canonical schema keys", () => {
    const requiredKeys = [
      "\"marketReports\"",
      "\"competitors\"",
      "\"indirectCompetitors\"",
      "\"indirectCompetitorsDetailed\"",
      "\"marketTrends\"",
      "\"marketSize\"",
      "\"marketDrivers\"",
      "\"marketChallenges\"",
      "\"sources\"",
    ];
    for (const key of requiredKeys) {
      expect(MARKET_RESEARCH_SYSTEM_PROMPT).toContain(key);
    }
  });

  it("product prompt includes canonical schema keys", () => {
    const requiredKeys = [
      "\"productPages\"",
      "\"features\"",
      "\"techStack\"",
      "\"integrations\"",
      "\"customerReviews\"",
      "\"reviews\"",
      "\"strengths\"",
      "\"weaknesses\"",
      "\"sources\"",
    ];
    for (const key of requiredKeys) {
      expect(PRODUCT_RESEARCH_SYSTEM_PROMPT).toContain(key);
    }
  });

  it("team prompt includes canonical schema keys", () => {
    const requiredKeys = [
      "\"linkedinProfiles\"",
      "\"previousCompanies\"",
      "\"education\"",
      "\"achievements\"",
      "\"onlinePresence\"",
      "\"teamSummary\"",
      "\"sources\"",
    ];
    for (const key of requiredKeys) {
      expect(TEAM_RESEARCH_SYSTEM_PROMPT).toContain(key);
    }
  });

  it("news prompt includes canonical schema keys", () => {
    const requiredKeys = [
      "\"articles\"",
      "\"pressReleases\"",
      "\"sentiment\"",
      "\"recentEvents\"",
      "\"sentimentOverview\"",
      "\"sources\"",
    ];
    for (const key of requiredKeys) {
      expect(NEWS_RESEARCH_SYSTEM_PROMPT).toContain(key);
    }
  });

  it("competitor prompt includes canonical schema keys", () => {
    const requiredKeys = [
      "\"competitors\"",
      "\"indirectCompetitors\"",
      "\"marketPositioning\"",
      "\"competitiveLandscapeSummary\"",
      "\"sources\"",
    ];
    for (const key of requiredKeys) {
      expect(COMPETITOR_RESEARCH_SYSTEM_PROMPT).toContain(key);
    }
  });
});
