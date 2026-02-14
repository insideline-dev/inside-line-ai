export const PIPELINE_PHASE_ORDER = [
  "extraction",
  "scraping",
  "research",
  "evaluation",
  "synthesis",
] as const;

export type PipelinePhaseKey = (typeof PIPELINE_PHASE_ORDER)[number] | string;

export interface PipelineAgentProgress {
  key: string;
  status: "pending" | "running" | "completed" | "failed" | string;
  progress?: number;
  startedAt?: string;
  completedAt?: string;
  error?: string;
}

export interface PipelinePhaseProgress {
  status: "pending" | "waiting" | "running" | "completed" | "failed" | "skipped" | string;
  progress: number;
  startedAt?: string;
  completedAt?: string;
  error?: string;
  agents?: Record<string, PipelineAgentProgress>;
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
}

export interface StartupProgressResponse {
  status?: string;
  progress: PipelineProgressData | null;
}
