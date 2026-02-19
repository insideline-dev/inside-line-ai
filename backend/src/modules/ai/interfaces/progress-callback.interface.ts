export interface PhaseStepTraceData {
  inputJson?: unknown;
  outputJson?: unknown;
  inputText?: string;
  outputText?: string;
  meta?: Record<string, unknown>;
}

export interface PhaseStepCompletePayload extends PhaseStepTraceData {
  summary?: Record<string, unknown>;
}

export interface PhaseProgressCallback {
  onStepStart: (stepKey: string, trace?: PhaseStepTraceData) => void;
  onStepComplete: (
    stepKey: string,
    payload?: PhaseStepCompletePayload,
  ) => void;
  onStepFailed: (
    stepKey: string,
    error: string,
    trace?: PhaseStepTraceData,
  ) => void;
  onStepTrace?: (
    stepKey: string,
    status: "running" | "completed" | "failed",
    payload?: PhaseStepTraceData & { error?: string },
  ) => void;
}
