import type { ResearchAgentConfig } from "../../interfaces/agent.interface";
import { z } from "zod";
import {
  MARKET_RESEARCH_HUMAN_PROMPT,
  MARKET_RESEARCH_SYSTEM_PROMPT,
} from "../../prompts/research/market-research.prompt";
import { toValidUrl } from "./url.util";

export const MarketResearchAgent: ResearchAgentConfig<string> = {
  key: "market",
  name: "Market Research",
  systemPrompt: MARKET_RESEARCH_SYSTEM_PROMPT,
  humanPromptTemplate: MARKET_RESEARCH_HUMAN_PROMPT,
  schema: z.string(),
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
    return [
      `Market Research Report: ${extraction.companyName}`,
      "",
      "Executive Summary",
      `Fallback mode active. Independent TAM/SAM/SOM validation for ${extraction.industry} requires manual analyst verification.`,
      "",
      "Preliminary Directional Signal",
      `Early-stage capital allocation in ${extraction.industry} remains selective and evidence-driven.`,
      "",
      "Key Gap",
      "No high-confidence third-party market datasets were captured in automated mode.",
      "",
      "Primary Source",
      websiteUrl ?? "No verified primary source URL available.",
    ].join("\n");
  },
};
