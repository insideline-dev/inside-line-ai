import type {
  EnrichmentResult,
  ExtractionResult,
  ScrapingResult,
  ResearchResult,
  EvaluationResult,
  SynthesisResult,
} from './phase-results.interface';

export enum PipelinePhase {
  EXTRACTION = "extraction",
  ENRICHMENT = "enrichment",
  SCRAPING = "scraping",
  RESEARCH = "research",
  EVALUATION = "evaluation",
  SYNTHESIS = "synthesis",
}

export enum PhaseStatus {
  PENDING = "pending",
  WAITING = "waiting",
  RUNNING = "running",
  COMPLETED = "completed",
  FAILED = "failed",
  SKIPPED = "skipped",
}

export enum PipelineStatus {
  RUNNING = "running",
  COMPLETED = "completed",
  FAILED = "failed",
  CANCELLED = "cancelled",
}

export enum ModelPurpose {
  EXTRACTION = "extraction",
  ENRICHMENT = "enrichment",
  RESEARCH = "research",
  EVALUATION = "evaluation",
  SYNTHESIS = "synthesis",
  THESIS_ALIGNMENT = "thesis_alignment",
  LOCATION_NORMALIZATION = "location_normalization",
  OCR = "ocr",
}

export interface TokenUsage {
  input: number;
  output: number;
}

export interface AgentTelemetry {
  agentKey: string;
  phase: PipelinePhase;
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
  tokenUsage?: TokenUsage;
  model?: string;
  retryCount: number;
}

export interface PhaseTelemetry {
  phase: PipelinePhase;
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  agentCount: number;
  successCount: number;
  failedCount: number;
}

export interface PipelineTelemetry {
  startedAt: string;
  completedAt?: string;
  totalDurationMs?: number;
  totalTokens: TokenUsage;
  totalCostUsd?: number;
  bottleneckPhase?: PipelinePhase;
  bottleneckAgent?: string;
  phases: Record<PipelinePhase, PhaseTelemetry>;
  agents: Record<string, AgentTelemetry>;
}

export interface PhaseResult {
  status: PhaseStatus;
  startedAt?: string;
  completedAt?: string;
  error?: string;
}

export interface PhaseResultMap {
  [PipelinePhase.EXTRACTION]: ExtractionResult;
  [PipelinePhase.ENRICHMENT]: EnrichmentResult;
  [PipelinePhase.SCRAPING]: ScrapingResult;
  [PipelinePhase.RESEARCH]: ResearchResult;
  [PipelinePhase.EVALUATION]: EvaluationResult;
  [PipelinePhase.SYNTHESIS]: SynthesisResult;
}

export interface PipelineState {
  pipelineRunId: string;
  startupId: string;
  userId: string;
  status: PipelineStatus;
  quality: "standard" | "degraded";
  currentPhase: PipelinePhase;
  phases: Record<PipelinePhase, PhaseResult>;
  results: Partial<{ [K in PipelinePhase]: PhaseResultMap[K] }>;
  retryCounts: Partial<Record<PipelinePhase, number>>;
  telemetry: PipelineTelemetry;
  createdAt: string;
  updatedAt: string;
}
