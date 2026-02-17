import { z } from "zod";
import {
  ExtractionResult,
  ResearchResult,
  ScrapingResult,
} from "./phase-results.interface";

export type ResearchAgentKey = "team" | "market" | "product" | "news" | "competitor";

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

export type EvaluationAgentLifecycleEventType =
  | "started"
  | "retrying"
  | "completed"
  | "fallback"
  | "failed";

export interface EvaluationAgentLifecycleEvent {
  agent: EvaluationAgentKey;
  event: EvaluationAgentLifecycleEventType;
  attempt: number;
  retryCount: number;
  error?: string;
}

export interface EvaluationAgentTraceEvent {
  agent: EvaluationAgentKey;
  status: "completed" | "fallback" | "failed";
  inputPrompt: string;
  outputText?: string;
  outputJson?: unknown;
  attempt: number;
  retryCount: number;
  usedFallback: boolean;
  error?: string;
}

export interface EvaluationAgentRunOptions {
  feedbackNotes?: EvaluationFeedbackNote[];
  onLifecycle?: (event: EvaluationAgentLifecycleEvent) => void;
  onTrace?: (event: EvaluationAgentTraceEvent) => void;
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
