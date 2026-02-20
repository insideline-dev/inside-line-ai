import type { ResearchAgentConfig } from "../../interfaces/agent.interface";
import type { NewsResearch } from "../../schemas";
import { NewsResearchSchema } from "../../schemas";
import {
  NEWS_RESEARCH_HUMAN_PROMPT,
  NEWS_RESEARCH_SYSTEM_PROMPT,
} from "../../prompts/research/news-research.prompt";
import { toValidUrl } from "./url.util";

export const NewsResearchAgent: ResearchAgentConfig<NewsResearch> = {
  key: "news",
  name: "News Research",
  systemPrompt: NEWS_RESEARCH_SYSTEM_PROMPT,
  humanPromptTemplate: NEWS_RESEARCH_HUMAN_PROMPT,
  schema: NewsResearchSchema,
  contextBuilder: ({ extraction, researchParameters }) => ({
    companyName: extraction.companyName,
    industry: extraction.industry,
    geographicFocus: researchParameters?.geographicFocus ?? extraction.location,
    foundingDate: undefined,
    knownFunding:
      typeof extraction.fundingAsk === "number"
        ? [{ date: "unknown", amount: extraction.fundingAsk }]
        : [],
    specificMarket: researchParameters?.specificMarket,
  }),
  fallback: ({ extraction }) => {
    const websiteUrl = toValidUrl(extraction.website);

    return {
      articles: [],
      pressReleases: [
        `${extraction.companyName} public announcement coverage is currently limited.`,
      ],
      sentiment: "neutral",
      recentEvents: [
        `No critical negative events detected in fallback mode for ${extraction.companyName}.`,
      ],
      sentimentOverview: undefined,
      sources: websiteUrl ? [websiteUrl] : [],
    };
  },
};
