// @ts-nocheck
// DS-E11-F3-S1 — light coverage for the calibration proposal hook
// scaffolding. The frontend bundle doesn't ship a DOM testing harness
// (see frontend/src/lib/screening/*.test.ts pattern), so we exercise the
// query-key + URL plumbing exposed by the hooks rather than mounting
// React. Once the testing-library setup lands the render path can be
// covered alongside.
import { describe, expect, it } from "bun:test";
import { getCalibrationProposalsQueryKey } from "./useCalibration";

describe("getCalibrationProposalsQueryKey", () => {
  it("defaults to pending status so the typical hit isolates pending rows", () => {
    expect(getCalibrationProposalsQueryKey()).toEqual([
      "investor",
      "calibration",
      "proposals",
      "pending",
    ]);
  });

  it("forks the cache key per status so approve/reject lists never collide", () => {
    expect(getCalibrationProposalsQueryKey("approved")).not.toEqual(
      getCalibrationProposalsQueryKey("rejected"),
    );
    expect(getCalibrationProposalsQueryKey("approved")).toEqual([
      "investor",
      "calibration",
      "proposals",
      "approved",
    ]);
  });
});
