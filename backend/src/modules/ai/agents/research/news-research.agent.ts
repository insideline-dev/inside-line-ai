import type { ResearchAgentConfig } from "../../interfaces/agent.interface";
import { z } from "zod";
import {
  NEWS_RESEARCH_HUMAN_PROMPT,
  NEWS_RESEARCH_SYSTEM_PROMPT,
} from "../../prompts/research/news-research.prompt";
import { toValidUrl } from "./url.util";

export const NewsResearchAgent: ResearchAgentConfig<string> = {
  key: "news",
  name: "News Research",
  systemPrompt: NEWS_RESEARCH_SYSTEM_PROMPT,
  humanPromptTemplate: NEWS_RESEARCH_HUMAN_PROMPT,
  schema: z.string(),
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
    return [
      `News Research Report: ${extraction.companyName}`,
      "",
      "Executive Summary",
      "Automated news sweep ran in deterministic fallback mode with limited verified coverage.",
      "",
      "Directional Sentiment",
      "No critical negative signal was deterministically confirmed from fallback inputs.",
      "",
      "Evidence Gap",
      "Recent article-level citation coverage requires manual follow-up using external news databases.",
      "",
      "Primary Source",
      websiteUrl ?? "No verified primary source URL available.",
    ].join("\n");
  },
};
