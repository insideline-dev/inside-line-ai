import type { ResearchAgentConfig } from "../../interfaces/agent.interface";
import { CompetitorResearchAgent } from "./competitor-research.agent";
import { MarketResearchAgent } from "./market-research.agent";
import { NewsResearchAgent } from "./news-research.agent";
import { ProductResearchAgent } from "./product-research.agent";
import { TeamResearchAgent } from "./team-research.agent";

export type ResearchAgentOutput = string;

/** Phase 1 agents run in parallel */
export const RESEARCH_AGENTS: Record<
  "team" | "market" | "product" | "news",
  ResearchAgentConfig<ResearchAgentOutput>
> = {
  team: TeamResearchAgent,
  market: MarketResearchAgent,
  product: ProductResearchAgent,
  news: NewsResearchAgent,
};

/** Phase 2 agents run after phase 1 completes */
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
