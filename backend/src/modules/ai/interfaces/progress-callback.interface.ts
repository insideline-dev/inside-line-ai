export interface PhaseProgressCallback {
  onStepStart: (stepKey: string) => void;
  onStepComplete: (
    stepKey: string,
    summary?: Record<string, unknown>,
  ) => void;
  onStepFailed: (stepKey: string, error: string) => void;
}
