/**
 * DS-E11-F3-S1 — knobs for the calibration proposal generation heuristic
 * and the dedupe window. Pulled out as constants so the unit tests can
 * read them and the heuristic stays self-documenting.
 *
 *   - `OVERRIDE_COUNT_THRESHOLD`: a single override reason needs this many
 *     occurrences in the latest calibration summary's `topOverrideReasons`
 *     for the heuristic to consider it actionable. 3 was the AC's example
 *     — small enough to surface real signal early, large enough to filter
 *     a one-off mismatch.
 *
 *   - `LENS_DELTA_DRIFT_THRESHOLD`: a single lens needs an absolute median
 *     delta (`abs(meanDelta)`) at least this large for the heuristic to
 *     consider the screening lens systematically miscalibrated. 10 on the
 *     0-100 lens scale is "a full grade off" — anything less is noise.
 *
 *   - `LENS_DELTA_MIN_COUNT`: lens-delta drift needs at least this many
 *     contributing deals before we trust the mean. Stops the heuristic
 *     from firing off a single mismatched DD run.
 *
 *   - `PROPOSAL_DEDUPE_WINDOW_MS`: the issue's idempotency rule — if a
 *     `calibration_proposal_created` event with the same key was emitted
 *     within this window (7 days), the recompute skips re-emission. Same
 *     evidence, same delta → no new proposal.
 *
 * Heuristic is intentionally simple and documented inline so a follow-up
 * story can iterate (e.g. weight overrides by lens importance).
 */
export const OVERRIDE_COUNT_THRESHOLD = 3;
export const LENS_DELTA_DRIFT_THRESHOLD = 10;
export const LENS_DELTA_MIN_COUNT = 2;
export const PROPOSAL_DEDUPE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Event-name constants for the WS plumbing. Reuses the same
 * `investor.*` namespace as the recompute events so the existing
 * `useSocket` subscription in the frontend picks them up.
 */
export const CALIBRATION_PROPOSAL_CREATED_EVENT =
  "investor.calibration.proposal.created" as const;
