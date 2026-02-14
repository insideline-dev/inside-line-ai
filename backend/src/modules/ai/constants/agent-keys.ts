import type { EvaluationAgentKey, ResearchAgentKey } from "../interfaces/agent.interface";

export const RESEARCH_AGENT_KEYS = [
  "team",
  "market",
  "product",
  "news",
  "competitor",
] as const satisfies readonly ResearchAgentKey[];

export const EVALUATION_AGENT_KEYS = [
  "team",
  "market",
  "product",
  "traction",
  "businessModel",
  "gtm",
  "financials",
  "competitiveAdvantage",
  "legal",
  "dealTerms",
  "exitPotential",
] as const satisfies readonly EvaluationAgentKey[];
