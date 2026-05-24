import { describe, it, expect } from "bun:test";
import {
  applyAdjustmentsToWeights,
} from "./scoring-preferences.service";
import type { ScoringWeights } from "./entities/investor.schema";

// DS-E11-F3-S1 — verify the pure adjustment function the approve path
// uses to mutate per-stage weights when an investor approves a proposal.

function balanced(): ScoringWeights {
  // 11 lenses summing to 100. Seed-stage-ish defaults.
  return {
    team: 20,
    market: 20,
    traction: 20,
    product: 10,
    businessModel: 5,
    gtm: 5,
    financials: 5,
    competitiveAdvantage: 5,
    legal: 4,
    dealTerms: 3,
    exitPotential: 3,
  };
}

function sum(w: ScoringWeights): number {
  return Object.values(w).reduce((a, b) => a + b, 0);
}

describe("applyAdjustmentsToWeights (DS-E11-F3-S1)", () => {
  it("nudges the target lens by the signed delta", () => {
    const after = applyAdjustmentsToWeights(balanced(), [
      { lensKey: "team", adjustment: 5 },
    ]);
    expect(after.team).toBe(25);
  });

  it("absorbs the inverse proportionally across the other two screening lenses", () => {
    // team +10 → market & traction split -10 evenly (they had equal 20 each).
    const after = applyAdjustmentsToWeights(balanced(), [
      { lensKey: "team", adjustment: 10 },
    ]);
    expect(after.team).toBe(30);
    expect(after.market).toBe(15);
    expect(after.traction).toBe(15);
  });

  it("leaves the 8 non-screening lenses untouched", () => {
    const before = balanced();
    const after = applyAdjustmentsToWeights(before, [
      { lensKey: "market", adjustment: -5 },
    ]);
    expect(after.product).toBe(before.product);
    expect(after.businessModel).toBe(before.businessModel);
    expect(after.gtm).toBe(before.gtm);
    expect(after.financials).toBe(before.financials);
    expect(after.competitiveAdvantage).toBe(before.competitiveAdvantage);
    expect(after.legal).toBe(before.legal);
    expect(after.dealTerms).toBe(before.dealTerms);
    expect(after.exitPotential).toBe(before.exitPotential);
  });

  it("keeps the all-11 sum at 100 (within rounding)", () => {
    const after = applyAdjustmentsToWeights(balanced(), [
      { lensKey: "team", adjustment: 7 },
      { lensKey: "market", adjustment: -3 },
    ]);
    expect(Math.round(sum(after))).toBe(100);
  });

  it("clamps the target lens to [0, 100]", () => {
    const after = applyAdjustmentsToWeights(balanced(), [
      { lensKey: "team", adjustment: 200 },
    ]);
    expect(after.team).toBeLessThanOrEqual(100);
    expect(after.team).toBeGreaterThanOrEqual(0);
  });

  it("is a no-op when adjustment is zero", () => {
    const before = balanced();
    const after = applyAdjustmentsToWeights(before, [
      { lensKey: "team", adjustment: 0 },
    ]);
    expect(after).toEqual(before);
  });
});
