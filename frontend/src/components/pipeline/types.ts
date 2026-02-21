export interface PhaseConfig {
  phase: string;
  dependsOn: string[];
  canRunParallelWith: string[];
  timeoutMs: number;
  maxRetries: number;
  required: boolean;
  queue: string;
}

export interface PipelineConfig {
  phases: PhaseConfig[];
  maxPipelineTimeoutMs: number;
  defaultRetryPolicy: {
    maxRetries: number;
    backoff: "exponential" | "linear" | "fixed";
    initialDelayMs: number;
  };
  minimumEvaluationAgents: number;
}
