import type { ResearchAgentConfig } from "../../interfaces/agent.interface";
import { CompetitorResearchAgent } from "./competitor-research.agent";
import { MarketResearchAgent } from "./market-research.agent";
import { NewsResearchAgent } from "./news-research.agent";
import { ProductResearchAgent } from "./product-research.agent";
import { TeamResearchAgent } from "./team-research.agent";

export type ResearchAgentOutput = string;

/** @deprecated Use ALL_RESEARCH_AGENTS — all agents now run in a single staggered wave */
export const RESEARCH_AGENTS: Record<
  "team" | "market" | "product" | "news",
  ResearchAgentConfig<ResearchAgentOutput>
> = {
  team: TeamResearchAgent,
  market: MarketResearchAgent,
  product: ProductResearchAgent,
  news: NewsResearchAgent,
};

/** @deprecated Use ALL_RESEARCH_AGENTS — all agents now run in a single staggered wave */
export const PHASE_2_RESEARCH_AGENTS: Record<
  "competitor",
  ResearchAgentConfig<ResearchAgentOutput>
> = {
  competitor: CompetitorResearchAgent,
};

export const ALL_RESEARCH_AGENTS = {
  ...RESEARCH_AGENTS,
  ...PHASE_2_RESEARCH_AGENTS,
} as const;

export {
  TeamResearchAgent,
  MarketResearchAgent,
  ProductResearchAgent,
  NewsResearchAgent,
  CompetitorResearchAgent,
};
