export const PIPELINE_PHASE_ORDER = [
  "extraction",
  "enrichment",
  "scraping",
  "research",
  "evaluation",
  "synthesis",
] as const;

export type PipelinePhaseKey = (typeof PIPELINE_PHASE_ORDER)[number] | string;

export type PipelineFallbackReason =
  | "EMPTY_STRUCTURED_OUTPUT"
  | "TIMEOUT"
  | "SCHEMA_OUTPUT_INVALID"
  | "MODEL_OR_PROVIDER_ERROR"
  | "UNHANDLED_AGENT_EXCEPTION"
  | "MISSING_PROVIDER_EVIDENCE"
  | "MISSING_BRAVE_TOOL_CALL";

export type PipelineAgentEventType =
  | "started"
  | "retrying"
  | "completed"
  | "failed"
  | "fallback";

export interface PipelineAgentProgress {
  key: string;
  status: "pending" | "running" | "completed" | "failed" | string;
  progress?: number;
  startedAt?: string;
  completedAt?: string;
  error?: string;
  attempts?: number;
  retryCount?: number;
  phaseRetryCount?: number;
  agentAttemptId?: string;
  usedFallback?: boolean;
  fallbackReason?: PipelineFallbackReason;
  rawProviderError?: string;
  lastEvent?: PipelineAgentEventType;
  lastEventAt?: string;
  dataSummary?: Record<string, unknown>;
}

export interface PipelinePhaseProgress {
  status: "pending" | "waiting" | "running" | "completed" | "failed" | "skipped" | string;
  progress: number;
  startedAt?: string;
  completedAt?: string;
  error?: string;
  retryCount?: number;
  agents?: Record<string, PipelineAgentProgress>;
}

export interface PipelineAgentEvent {
  id: string;
  pipelineRunId?: string;
  phase: PipelinePhaseKey;
  agentKey: string;
  event: PipelineAgentEventType;
  timestamp: string;
  attempt?: number;
  retryCount?: number;
  phaseRetryCount?: number;
  agentAttemptId?: string;
  error?: string;
  fallbackReason?: PipelineFallbackReason;
  rawProviderError?: string;
}

export interface PipelineAgentTrace {
  id: string;
  pipelineRunId: string;
  phase: PipelinePhaseKey;
  agentKey: string;
  traceKind?: "ai_agent" | "phase_step";
  stepKey?: string;
  status: "running" | "completed" | "failed" | "fallback";
  attempt?: number;
  retryCount?: number;
  usedFallback?: boolean;
  inputText?: string | null;
  inputPrompt?: string | null;
  systemPrompt?: string | null;
  inputJson?: unknown;
  outputText?: string | null;
  outputJson?: unknown;
  meta?: Record<string, unknown>;
  error?: string | null;
  fallbackReason?: PipelineFallbackReason;
  rawProviderError?: string;
  captureStatus?: "captured" | "missing" | "provider_error_only";
  startedAt?: string;
  completedAt?: string | null;
}

export interface PipelineProgressData {
  overallProgress: number;
  currentPhase: PipelinePhaseKey;
  pipelineStatus?: "running" | "completed" | "failed" | "cancelled" | string;
  pipelineRunId?: string;
  estimatedTimeRemaining?: number;
  updatedAt?: string;
  error?: string;
  phasesCompleted: string[];
  phases: Record<string, PipelinePhaseProgress>;
  agentEvents?: PipelineAgentEvent[];
  agentTraces?: PipelineAgentTrace[];
  phaseResults?: Record<string, unknown>;
}

export interface StartupProgressResponse {
  status?: string;
  progress: PipelineProgressData | null;
}
