import { z } from "zod";
import {
  BusinessModelEvaluationSchema,
  CompetitiveAdvantageEvaluationSchema,
  DealTermsEvaluationSchema,
  ExitPotentialEvaluationSchema,
  FinancialsEvaluationSchema,
  GtmEvaluationSchema,
  LegalEvaluationSchema,
  MarketEvaluationSchema,
  ProductEvaluationSchema,
  TeamEvaluationSchema,
  TractionEvaluationSchema,
} from "./evaluations";
import { ExtractionSchema } from "./extraction.schema";
import { ThesisAlignmentSchema } from "./matching";
import {
  CompetitorResearchSchema,
  MarketResearchSchema,
  NewsResearchSchema,
  ProductResearchSchema,
  TeamResearchSchema,
} from "./research";
import { SynthesisSchema } from "./synthesis.schema";

export const EVALUATION_SCHEMAS = {
  team: TeamEvaluationSchema,
  market: MarketEvaluationSchema,
  product: ProductEvaluationSchema,
  traction: TractionEvaluationSchema,
  businessModel: BusinessModelEvaluationSchema,
  gtm: GtmEvaluationSchema,
  financials: FinancialsEvaluationSchema,
  competitiveAdvantage: CompetitiveAdvantageEvaluationSchema,
  legal: LegalEvaluationSchema,
  dealTerms: DealTermsEvaluationSchema,
  exitPotential: ExitPotentialEvaluationSchema,
} as const;

export const RESEARCH_SCHEMAS = {
  team: TeamResearchSchema,
  market: MarketResearchSchema,
  product: ProductResearchSchema,
  news: NewsResearchSchema,
  competitor: CompetitorResearchSchema,
} as const;

export type EvaluationAgentKey = keyof typeof EVALUATION_SCHEMAS;
export type ResearchAgentKey = keyof typeof RESEARCH_SCHEMAS;

export const AI_SCHEMAS = {
  extraction: ExtractionSchema,
  synthesis: SynthesisSchema,
  thesisAlignment: ThesisAlignmentSchema,
  evaluation: EVALUATION_SCHEMAS,
  research: RESEARCH_SCHEMAS,
} as const;

export function isZodSchema(input: unknown): input is z.ZodTypeAny {
  return Boolean(
    input && typeof (input as z.ZodTypeAny).safeParse === "function",
  );
}

export * from "./base-evaluation.schema";
export * from "./simple-evaluation.schema";
export * from "./deck-structured-data.schema";
export * from "./extraction.schema";
export * from "./synthesis.schema";
export * from "./matching";
export * from "./evaluations";
export * from "./research";
