import { ServiceUnavailableException } from '@nestjs/common';

/**
 * DS-E11 calibration loop.
 *
 * Default flipped to ENABLED on 2026-05-22. The env flag stays in place
 * (`ENABLE_CALIBRATION=false` to roll back) because the two-loop redesign
 * (GitHub issue #32) is NOT yet shipped — the current code is the
 * single-loop implementation. We re-enable it to unblock F1/F2/F3/F4 in
 * the meantime; when the two-loop work lands, this file should be
 * deleted along with every call site of `assertCalibrationEnabled`.
 *
 * Pending two-loop work tracked in #32.
 */
export const CALIBRATION_DISABLED_MESSAGE =
  'Calibration is temporarily disabled (DS-E11 two-loop redesign). See GitHub issue #32.';

export function isCalibrationEnabled(): boolean {
  const raw = process.env.ENABLE_CALIBRATION;
  if (raw === 'false' || raw === '0') return false;
  // Default ON. Explicit env-flag opt-out kept for rollback.
  return true;
}

export function assertCalibrationEnabled(): void {
  if (!isCalibrationEnabled()) {
    throw new ServiceUnavailableException(CALIBRATION_DISABLED_MESSAGE);
  }
}
