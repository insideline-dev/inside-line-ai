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
  contextBuilder: ({ extraction, scraping, researchParameters }) => ({
    industry: extraction.industry,
    geographicFocus: researchParameters?.geographicFocus ?? (extraction.location ? [extraction.location] : []),
    companyDescription: extraction.rawText,
    targetMarket: researchParameters?.specificMarket ?? scraping.notableClaims[0] ?? extraction.tagline,
    targetCustomers: researchParameters?.targetCustomers,
    claimedTam: researchParameters?.claimedMetrics?.tam,
    claimedGrowthRate: researchParameters?.claimedMetrics?.growthRate,
    businessModel: researchParameters?.businessModel,
  }),
  fallback: ({ extraction }) => {
    const websiteUrl = toValidUrl(extraction.website);

    return {
      marketReports: [
        `${extraction.industry} benchmarks should be validated with external reports`,
      ],
      competitors: [],
      indirectCompetitors: [],
      indirectCompetitorsDetailed: [],
      marketTrends: [
        `Early-stage ${extraction.industry} investment interest remains selective`,
      ],
      marketSize: {
        tam: undefined,
        sam: undefined,
        som: undefined,
      },
      marketDrivers: [],
      marketChallenges: [],
      regulatoryLandscape: undefined,
      totalAddressableMarket: undefined,
      marketGrowthRate: undefined,
      tamValidation: undefined,
      sources: websiteUrl ? [websiteUrl] : [],
    };
  },
};
