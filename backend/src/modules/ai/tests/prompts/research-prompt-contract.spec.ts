import { describe, expect, it } from "bun:test";
import { MARKET_RESEARCH_SYSTEM_PROMPT } from "../../prompts/research/market-research.prompt";
import { PRODUCT_RESEARCH_SYSTEM_PROMPT } from "../../prompts/research/product-research.prompt";
import { TEAM_RESEARCH_SYSTEM_PROMPT } from "../../prompts/research/team-research.prompt";
import {
  NEWS_RESEARCH_HUMAN_PROMPT,
  NEWS_RESEARCH_SYSTEM_PROMPT,
} from "../../prompts/research/news-research.prompt";
import { COMPETITOR_RESEARCH_SYSTEM_PROMPT } from "../../prompts/research/competitor-research.prompt";

const PROMPTS = [
  MARKET_RESEARCH_SYSTEM_PROMPT,
  PRODUCT_RESEARCH_SYSTEM_PROMPT,
  TEAM_RESEARCH_SYSTEM_PROMPT,
  NEWS_RESEARCH_SYSTEM_PROMPT,
  COMPETITOR_RESEARCH_SYSTEM_PROMPT,
];

describe("Research prompt contracts", () => {
  it("enforces plain-text response contract for all research prompts", () => {
    for (const prompt of PROMPTS) {
      expect(prompt).toContain("Return ONLY plain text report output");
      expect(prompt).toContain("Do NOT return JSON");
      expect(prompt).toContain("at least 2500 characters");
    }
  });

  it("uses the teamMembers variable in the news prompt", () => {
    expect(NEWS_RESEARCH_HUMAN_PROMPT).toContain("=== TEAM MEMBERS ===");
    expect(NEWS_RESEARCH_HUMAN_PROMPT).toContain("{{teamMembers}}");
    expect(NEWS_RESEARCH_HUMAN_PROMPT).not.toContain("{{founderNames}}");
  });
});
