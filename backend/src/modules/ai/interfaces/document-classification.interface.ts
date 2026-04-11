import type { EvaluationAgentKey } from "./agent.interface";

export enum DocumentCategory {
  PITCH_DECK = "pitch_deck",
  FINANCIAL = "financial",
  CAP_TABLE = "cap_table",
  LEGAL = "legal",
  TECHNICAL_PRODUCT = "technical_product",
  BUSINESS_PLAN = "business_plan",
  MARKET_RESEARCH = "market_research",
  CONTRACT = "contract",
  TEAM_HR = "team_hr",
  MISCELLANEOUS = "miscellaneous",
}

export interface DocumentClassification {
  category: DocumentCategory;
  confidence: number;
  agentKeys: EvaluationAgentKey[];
}

export interface ClassifiedFile {
  path: string;
  name: string;
  type: string;
  category?: DocumentCategory;
  confidence?: number;
}

export const ALL_EVALUATION_AGENTS: EvaluationAgentKey[] = [
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
];

export const CATEGORY_AGENT_MAP: Record<DocumentCategory, EvaluationAgentKey[]> = {
  [DocumentCategory.PITCH_DECK]: ALL_EVALUATION_AGENTS,
  [DocumentCategory.FINANCIAL]: ["financials", "dealTerms", "traction"],
  [DocumentCategory.CAP_TABLE]: ["financials", "dealTerms", "exitPotential"],
  [DocumentCategory.LEGAL]: ["legal", "dealTerms"],
  [DocumentCategory.TECHNICAL_PRODUCT]: ["product", "competitiveAdvantage"],
  [DocumentCategory.BUSINESS_PLAN]: ["market", "businessModel", "gtm"],
  [DocumentCategory.MARKET_RESEARCH]: ["market", "competitiveAdvantage"],
  [DocumentCategory.CONTRACT]: ["legal"],
  [DocumentCategory.TEAM_HR]: ["team"],
  [DocumentCategory.MISCELLANEOUS]: [],
};
