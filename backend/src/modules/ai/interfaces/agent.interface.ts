import { z } from "zod";
import {
  EnrichmentResult,
  ExtractionResult,
  ResearchResult,
  ScrapingResult,
} from "./phase-results.interface";
import type { ResearchParameters } from "./research-parameters.interface";

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
  enrichment?: EnrichmentResult;
  researchParameters?: ResearchParameters;
  orchestratorGuidance?: string;
}

export interface EvaluationPipelineInput {
  extraction: ExtractionResult;
  scraping: ScrapingResult;
  research: ResearchResult;
  enrichment?: EnrichmentResult;
  mappedInputs?: Record<string, unknown>;
  mappedInputSources?: Array<{
    researchAgentId: ResearchAgentKey;
    nodeId: string;
    path?: string;
  }>;
  edgeDrivenInputFallbackUsed?: boolean;
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
  attempt?: number;
  retryCount?: number;
  error?: string;
  fallbackReason?: EvaluationFallbackReason;
  rawProviderError?: string;
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

export type EvaluationFallbackReason =
  | "EMPTY_STRUCTURED_OUTPUT"
  | "TIMEOUT"
  | "SCHEMA_OUTPUT_INVALID"
  | "MODEL_OR_PROVIDER_ERROR"
  | "UNHANDLED_AGENT_EXCEPTION";

export type PipelineFallbackReason =
  | EvaluationFallbackReason
  | "MISSING_PROVIDER_EVIDENCE"
  | "MISSING_BRAVE_TOOL_CALL";

export interface EvaluationAgentLifecycleEvent {
  agent: EvaluationAgentKey;
  event: EvaluationAgentLifecycleEventType;
  attempt: number;
  retryCount: number;
  error?: string;
  fallbackReason?: EvaluationFallbackReason;
  rawProviderError?: string;
}

export interface EvaluationAgentTraceEvent {
  agent: EvaluationAgentKey;
  status: "completed" | "fallback" | "failed";
  captureStatus?: "captured" | "missing" | "provider_error_only";
  inputPrompt: string;
  outputText?: string;
  outputJson?: unknown;
  attempt: number;
  retryCount: number;
  usedFallback: boolean;
  error?: string;
  fallbackReason?: EvaluationFallbackReason;
  rawProviderError?: string;
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
  dataSummary?: Record<string, unknown>;
  attempt?: number;
  retryCount?: number;
  error?: string;
  fallbackReason?: EvaluationFallbackReason;
  rawProviderError?: string;
}

export interface EvaluationAgent<TOutput> {
  key: EvaluationAgentKey;
  run(
    pipelineData: EvaluationPipelineInput,
    options?: EvaluationAgentRunOptions,
  ): Promise<EvaluationAgentResult<TOutput>>;
  fallback(pipelineData: EvaluationPipelineInput): TOutput;
}
