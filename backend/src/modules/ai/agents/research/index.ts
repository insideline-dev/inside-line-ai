import type { ResearchAgentConfig } from "../../interfaces/agent.interface";
import type {
  MarketResearch,
  NewsResearch,
  ProductResearch,
  TeamResearch,
} from "../../schemas";
import { MarketResearchAgent } from "./market-research.agent";
import { NewsResearchAgent } from "./news-research.agent";
import { ProductResearchAgent } from "./product-research.agent";
import { TeamResearchAgent } from "./team-research.agent";

export type ResearchAgentOutput =
  | TeamResearch
  | MarketResearch
  | ProductResearch
  | NewsResearch;

export const RESEARCH_AGENTS: Record<
  "team" | "market" | "product" | "news",
  ResearchAgentConfig<ResearchAgentOutput>
> = {
  team: TeamResearchAgent,
  market: MarketResearchAgent,
  product: ProductResearchAgent,
  news: NewsResearchAgent,
};

export { TeamResearchAgent, MarketResearchAgent, ProductResearchAgent, NewsResearchAgent };
