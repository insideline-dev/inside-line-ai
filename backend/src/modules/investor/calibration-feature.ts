import { ServiceUnavailableException } from '@nestjs/common';

/** DS-E11 calibration postponed — re-enable with ENABLE_CALIBRATION=true */
export const CALIBRATION_DISABLED_MESSAGE =
  'Calibration is temporarily disabled (DS-E11 two-loop redesign). See GitHub issue #32.';

export function isCalibrationEnabled(): boolean {
  const raw = process.env.ENABLE_CALIBRATION;
  if (raw === 'true' || raw === '1') return true;
  if (raw === 'false' || raw === '0') return false;
  return false;
}

export function assertCalibrationEnabled(): void {
  if (!isCalibrationEnabled()) {
    throw new ServiceUnavailableException(CALIBRATION_DISABLED_MESSAGE);
  }
}
