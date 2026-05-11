/**
 * DS-E11-F4-S1 — discriminator for calibration recompute jobs on the
 * shared TASK queue, plus the WS event name the admin UI listens for.
 */
export const CALIBRATION_RECOMPUTE_JOB = "investor.calibration.recompute" as const;

export const CALIBRATION_RECOMPUTE_EVENT =
  "investor.calibration.recompute.completed" as const;

export const CALIBRATION_RECOMPUTE_FAILED_EVENT =
  "investor.calibration.recompute.failed" as const;

/**
 * Dedupe window — if a recompute is requested for the same investor while
 * a prior job is still queued/running OR completed within this window, we
 * return the existing job id instead of enqueuing another.
 */
export const CALIBRATION_RECOMPUTE_DEDUPE_WINDOW_MS = 10_000;

export interface CalibrationRecomputeJobPayload {
  investorId: string;
}
