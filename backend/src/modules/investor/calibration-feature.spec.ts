import { describe, it, expect, afterEach } from "bun:test";
import {
  CALIBRATION_DISABLED_MESSAGE,
  assertCalibrationEnabled,
  isCalibrationEnabled,
} from "./calibration-feature";

// DS-E11 calibration feature flag. Hard-disabled for now (issue #32) —
// forced OFF regardless of the ENABLE_CALIBRATION env flag until the
// two-loop redesign lands.

describe("calibration feature flag (DS-E11)", () => {
  const original = process.env.ENABLE_CALIBRATION;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.ENABLE_CALIBRATION;
    } else {
      process.env.ENABLE_CALIBRATION = original;
    }
  });

  it("is OFF when the env flag is unset", () => {
    delete process.env.ENABLE_CALIBRATION;
    expect(isCalibrationEnabled()).toBe(false);
    expect(() => assertCalibrationEnabled()).toThrow(
      CALIBRATION_DISABLED_MESSAGE,
    );
  });

  it("stays OFF even when ENABLE_CALIBRATION=true", () => {
    process.env.ENABLE_CALIBRATION = "true";
    expect(isCalibrationEnabled()).toBe(false);
    expect(() => assertCalibrationEnabled()).toThrow(
      CALIBRATION_DISABLED_MESSAGE,
    );
  });

  it("stays OFF for any other value", () => {
    process.env.ENABLE_CALIBRATION = "yes";
    expect(isCalibrationEnabled()).toBe(false);

    process.env.ENABLE_CALIBRATION = "0";
    expect(isCalibrationEnabled()).toBe(false);
  });
});
