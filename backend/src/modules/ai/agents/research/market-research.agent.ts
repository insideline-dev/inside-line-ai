import type { ResearchAgentConfig } from "../../interfaces/agent.interface";
import type { MarketResearch } from "../../schemas";
import { MarketResearchSchema } from "../../schemas";
import {
  MARKET_RESEARCH_HUMAN_PROMPT,
  MARKET_RESEARCH_SYSTEM_PROMPT,
} from "../../prompts/research/market-research.prompt";
import { toValidUrl } from "./url.util";

export const MarketResearchAgent: ResearchAgentConfig<MarketResearch> = {
  key: "market",
  name: "Market Research",
  systemPrompt: MARKET_RESEARCH_SYSTEM_PROMPT,
  humanPromptTemplate: MARKET_RESEARCH_HUMAN_PROMPT,
  schema: MarketResearchSchema,
  contextBuilder: ({ extraction, scraping, gapReport }) => ({
    industry: extraction.industry,
    geographicFocus: extraction.location ? [extraction.location] : [],
    companyDescription: extraction.rawText,
    targetMarket: scraping.notableClaims[0] ?? extraction.tagline,
    gapDirectives: gapReport?.categories.find(c => c.category === "market")?.researchDirectives ?? [],
    gapPriority: gapReport?.categories.find(c => c.category === "market")?.priority ?? "medium",
  }),
  fallback: ({ extraction }) => {
    const websiteUrl = toValidUrl(extraction.website);

    return {
      marketReports: [
        `${extraction.industry} benchmarks should be validated with external reports`,
      ],
      competitors: [],
      marketTrends: [
        `Early-stage ${extraction.industry} investment interest remains selective`,
      ],
      marketSize: {
        tam: undefined,
        sam: undefined,
        som: undefined,
      },
      sources: websiteUrl ? [websiteUrl] : [],
    };
  },
};
