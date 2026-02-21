import type { ResearchAgentConfig } from "../../interfaces/agent.interface";
import type { CompetitorResearch } from "../../schemas";
import { CompetitorResearchSchema } from "../../schemas";
import {
  COMPETITOR_RESEARCH_HUMAN_PROMPT,
  COMPETITOR_RESEARCH_SYSTEM_PROMPT,
} from "../../prompts/research/competitor-research.prompt";

export const CompetitorResearchAgent: ResearchAgentConfig<CompetitorResearch> = {
  key: "competitor",
  name: "Competitor Research",
  systemPrompt: COMPETITOR_RESEARCH_SYSTEM_PROMPT,
  humanPromptTemplate: COMPETITOR_RESEARCH_HUMAN_PROMPT,
  schema: CompetitorResearchSchema,
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
  fallback: () => ({
    competitors: [],
    indirectCompetitors: [],
    marketPositioning:
      "Competitive positioning could not be determined in fallback mode.",
    competitiveLandscapeSummary:
      "Competitive landscape analysis requires manual review.",
    sources: [],
  }),
};
