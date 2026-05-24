import { describe, it, expect } from "bun:test";
import {
  MATERIAL_DELTA_THRESHOLD_POINTS,
} from "./lens-delta.service";
import {
  MIN_OUTCOME_EVENTS_FOR_AUTO_RECOMPUTE,
} from "./calibration-recompute.constants";

// DS-E11 — story-anchored constants. These tripwires fail if anyone
// edits a calibration threshold without thinking about it, since the
// story spec names exact magnitudes.

describe("calibration thresholds (DS-E11)", () => {
  it("F2: material lens-delta threshold is 15 points", () => {
    expect(MATERIAL_DELTA_THRESHOLD_POINTS).toBe(15);
  });

  it("F4: auto-trigger waits for >= 10 outcome events", () => {
    expect(MIN_OUTCOME_EVENTS_FOR_AUTO_RECOMPUTE).toBe(10);
  });
});
