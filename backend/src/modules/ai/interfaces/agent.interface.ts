import { z } from "zod";
import {
  ExtractionResult,
  ResearchResult,
  ScrapingResult,
} from "./phase-results.interface";
import type { GapReport } from "./gap-analysis.interface";

export type ResearchAgentKey = "team" | "market" | "product" | "news";

export type EvaluationAgentKey =
  | "team"
  | "market"
  | "product"
  | "traction"
  | "businessModel"
  | "gtm"
  | "financials"
  | "competitiveAdvantage"
  | "legal"
  | "dealTerms"
  | "exitPotential";

export interface ResearchPipelineInput {
  extraction: ExtractionResult;
  scraping: ScrapingResult;
  gapReport?: GapReport;
}

export interface EvaluationPipelineInput {
  extraction: ExtractionResult;
  scraping: ScrapingResult;
  research: ResearchResult;
}

export interface ResearchAgentConfig<TOutput> {
  key: ResearchAgentKey;
  name: string;
  systemPrompt: string;
  humanPromptTemplate: string;
  schema: z.ZodSchema<TOutput>;
  contextBuilder: (pipelineData: ResearchPipelineInput) => Record<string, unknown>;
  fallback: (pipelineData: ResearchPipelineInput) => TOutput;
}

export interface EvaluationAgentResult<TOutput> {
  key: EvaluationAgentKey;
  output: TOutput;
  usedFallback: boolean;
  error?: string;
}

export interface EvaluationFeedbackNote {
  scope: "phase" | `agent:${EvaluationAgentKey}`;
  feedback: string;
  createdAt: Date;
}

export interface EvaluationAgentRunOptions {
  feedbackNotes?: EvaluationFeedbackNote[];
}

export interface EvaluationAgentCompletion {
  agent: EvaluationAgentKey;
  output: unknown;
  usedFallback: boolean;
  error?: string;
}

export interface EvaluationAgent<TOutput> {
  key: EvaluationAgentKey;
  run(
    pipelineData: EvaluationPipelineInput,
    options?: EvaluationAgentRunOptions,
  ): Promise<EvaluationAgentResult<TOutput>>;
  fallback(pipelineData: EvaluationPipelineInput): TOutput;
}
