export const PIPELINE_PHASE_ORDER = [
  "extraction",
  "scraping",
  "research",
  "evaluation",
  "synthesis",
] as const;

export type PipelinePhaseKey = (typeof PIPELINE_PHASE_ORDER)[number] | string;

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
  usedFallback?: boolean;
  lastEvent?: PipelineAgentEventType;
  lastEventAt?: string;
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
  phase: PipelinePhaseKey;
  agentKey: string;
  event: PipelineAgentEventType;
  timestamp: string;
  attempt?: number;
  retryCount?: number;
  error?: string;
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
}

export interface StartupProgressResponse {
  status?: string;
  progress: PipelineProgressData | null;
}
