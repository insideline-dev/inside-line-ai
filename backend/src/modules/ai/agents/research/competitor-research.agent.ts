import type { ResearchAgentConfig } from "../../interfaces/agent.interface";
import { z } from "zod";
import {
  COMPETITOR_RESEARCH_HUMAN_PROMPT,
  COMPETITOR_RESEARCH_SYSTEM_PROMPT,
} from "../../prompts/research/competitor-research.prompt";

export const CompetitorResearchAgent: ResearchAgentConfig<string> = {
  key: "competitor",
  name: "Competitor Research",
  systemPrompt: COMPETITOR_RESEARCH_SYSTEM_PROMPT,
  humanPromptTemplate: COMPETITOR_RESEARCH_HUMAN_PROMPT,
  schema: z.string(),
  contextBuilder: ({ extraction, scraping, researchParameters }) => ({
    companyName: extraction.companyName,
    industry: extraction.industry,
    tagline: extraction.tagline,
    companyDescription: extraction.rawText,
    website: extraction.website,
    websiteHeadings:
      scraping.website?.headings.filter((h) => h.trim().length > 0) ?? [],
    knownCompetitors: researchParameters?.knownCompetitors,
    specificMarket: researchParameters?.specificMarket,
    businessModel: researchParameters?.businessModel,
  }),
  fallback: ({ extraction }) =>
    [
      `Competitor Research Report: ${extraction.companyName}`,
      "",
      "Executive Summary",
      "Competitive mapping is incomplete in deterministic fallback mode.",
      "",
      "Initial Positioning Signal",
      "Current evidence is insufficient to validate direct and indirect competitor threat ranking.",
      "",
      "Evidence Gap",
      "Comprehensive competitor landscape requires manual validation across product, funding, and GTM comparisons.",
      "",
      "Primary Source",
      extraction.website || "No verified primary source URL available.",
    ].join("\n"),
};
