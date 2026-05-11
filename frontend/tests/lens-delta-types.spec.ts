import { describe, expect, it } from "bun:test";
import type {
  InvestorCalibrationSummary,
  InvestorCalibrationLensDelta,
} from "@/lib/calibration/useCalibration";

// DS-E11-F2-S1 — type contract test for the lens-delta surface.
// `useCalibration` types are interim until the backend Swagger
// regeneration lands; pin the shape so admin investors.tsx can rely on
// `summary.lensDeltas` being a typed array.

describe("InvestorCalibrationSummary.lensDeltas typing", () => {
  it("allows the three overlapping lens keys and their aggregate fields", () => {
    const sample: InvestorCalibrationSummary = {
      totalDecisions: 0,
      decisionsWithTriage: 0,
      aligned: 0,
      falsePositive: 0,
      falseNegative: 0,
      softMismatch: 0,
      alignmentRate: null,
      topOverrideReasons: [],
      recentMismatches: [],
      lensDeltas: [
        { lensKey: "team", count: 4, meanDelta: 7.5, meanAbsDelta: 9.2 },
        { lensKey: "market", count: 4, meanDelta: -3, meanAbsDelta: 4.1 },
        { lensKey: "traction", count: 3, meanDelta: 0, meanAbsDelta: 2 },
      ],
    };

    // Exercise the contract: each entry should have a recognised key
    // and finite numeric aggregates. The admin investors.tsx panel
    // formats the delta sign and badge count off these fields.
    for (const delta of sample.lensDeltas) {
      const matchesLens =
        delta.lensKey === "team" ||
        delta.lensKey === "market" ||
        delta.lensKey === "traction";
      expect(matchesLens).toBe(true);
      expect(Number.isFinite(delta.count)).toBe(true);
      expect(Number.isFinite(delta.meanDelta)).toBe(true);
      expect(Number.isFinite(delta.meanAbsDelta)).toBe(true);
    }
  });

  it("treats an empty lensDeltas array as the default initial state", () => {
    const empty: InvestorCalibrationLensDelta[] = [];
    expect(empty).toHaveLength(0);
  });
});
