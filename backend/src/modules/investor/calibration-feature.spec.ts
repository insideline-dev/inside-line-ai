import { describe, it, expect, afterEach } from "bun:test";
import {
  CALIBRATION_DISABLED_MESSAGE,
  assertCalibrationEnabled,
  isCalibrationEnabled,
} from "./calibration-feature";

// DS-E11 calibration feature flag. Default flipped to ON 2026-05-22 so
// F1/F2/F3/F4 endpoints stop 503'ing; the env-flag opt-out stays in
// place as a rollback path until the two-loop redesign (#32) lands.

describe("calibration feature flag (DS-E11)", () => {
  const original = process.env.ENABLE_CALIBRATION;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.ENABLE_CALIBRATION;
    } else {
      process.env.ENABLE_CALIBRATION = original;
    }
  });

  it("defaults to ON when the env flag is unset", () => {
    delete process.env.ENABLE_CALIBRATION;
    expect(isCalibrationEnabled()).toBe(true);
    expect(() => assertCalibrationEnabled()).not.toThrow();
  });

  it("opts back out when ENABLE_CALIBRATION=false", () => {
    process.env.ENABLE_CALIBRATION = "false";
    expect(isCalibrationEnabled()).toBe(false);
    expect(() => assertCalibrationEnabled()).toThrow(
      CALIBRATION_DISABLED_MESSAGE,
    );
  });

  it("opts back out when ENABLE_CALIBRATION=0", () => {
    process.env.ENABLE_CALIBRATION = "0";
    expect(isCalibrationEnabled()).toBe(false);
  });

  it("stays ON for ENABLE_CALIBRATION=true and any other value", () => {
    process.env.ENABLE_CALIBRATION = "true";
    expect(isCalibrationEnabled()).toBe(true);

    process.env.ENABLE_CALIBRATION = "yes";
    expect(isCalibrationEnabled()).toBe(true);
  });
});
