import { describe, expect, it } from "bun:test";
import {
  evaluateStructuredDealbreakers,
  isRequireOverrideReasonCode,
  isStructuredRejectReasonCode,
  StructuredDealbreakerRuleListSchema,
  StructuredDealbreakerRuleSchema,
  type DealbreakerStartupSnapshot,
  type StructuredDealbreakerRule,
} from "./structured-dealbreaker";

function snapshot(
  overrides: Partial<DealbreakerStartupSnapshot> = {},
): DealbreakerStartupSnapshot {
  return {
    industry: "saas",
    sectorIndustry: null,
    sectorIndustryGroup: null,
    stage: "seed",
    location: "Dubai, UAE",
    fundingTarget: 1_000_000,
    valuation: 5_000_000,
    teamSize: 5,
    raiseType: "safe",
    ...overrides,
  };
}

describe("StructuredDealbreakerRuleSchema (DS-E4-F3-S1)", () => {
  it("accepts an IN rule with the default reject action", () => {
    const parsed = StructuredDealbreakerRuleSchema.parse({
      field: "industry",
      operator: "in",
      values: ["crypto", "gambling"],
    });
    expect(parsed.action).toBe("reject");
  });

  it("accepts a numeric LT rule with require_override action", () => {
    const parsed = StructuredDealbreakerRuleSchema.parse({
      field: "fundingTarget",
      operator: "lt",
      value: 250_000,
      action: "require_override",
    });
    expect(parsed.field).toBe("fundingTarget");
    expect(parsed.action).toBe("require_override");
  });

  it("rejects a numeric rule that's missing `value`", () => {
    expect(() =>
      StructuredDealbreakerRuleSchema.parse({
        field: "valuation",
        operator: "gt",
      }),
    ).toThrow();
  });

  it("caps the list at 100 rules", () => {
    const big = Array.from({ length: 101 }, (_, i) => ({
      field: "industry" as const,
      operator: "in" as const,
      values: [`x-${i}`],
    }));
    expect(() => StructuredDealbreakerRuleListSchema.parse(big)).toThrow();
  });
});

describe("evaluateStructuredDealbreakers (DS-E4-F3 evaluator)", () => {
  it("fires an IN rule when the candidate's industry matches", () => {
    const rules: StructuredDealbreakerRule[] = [
      { field: "industry", operator: "in", values: ["saas"], action: "reject" },
    ];
    const matches = evaluateStructuredDealbreakers(snapshot(), rules);
    expect(matches).toHaveLength(1);
    expect(matches[0].rule.action).toBe("reject");
    expect(isStructuredRejectReasonCode(matches[0].reasonCode)).toBe(true);
  });

  it("fires a NOT IN rule when the candidate's geography is outside the allowlist", () => {
    const rules: StructuredDealbreakerRule[] = [
      {
        field: "geography",
        operator: "not_in",
        values: ["United States"],
        action: "reject",
      },
    ];
    const matches = evaluateStructuredDealbreakers(snapshot(), rules);
    expect(matches).toHaveLength(1);
  });

  it("does NOT fire a NOT IN rule when the geography is in the allowlist", () => {
    const rules: StructuredDealbreakerRule[] = [
      {
        field: "geography",
        operator: "not_in",
        values: ["UAE"],
        action: "reject",
      },
    ];
    expect(evaluateStructuredDealbreakers(snapshot(), rules)).toEqual([]);
  });

  it("fires a numeric LT rule against fundingTarget", () => {
    const rules: StructuredDealbreakerRule[] = [
      {
        field: "fundingTarget",
        operator: "lt",
        value: 2_000_000,
        action: "require_override",
      },
    ];
    const matches = evaluateStructuredDealbreakers(snapshot(), rules);
    expect(matches).toHaveLength(1);
    expect(isRequireOverrideReasonCode(matches[0].reasonCode)).toBe(true);
  });

  it("does NOT fire a numeric rule when the candidate value is missing", () => {
    const rules: StructuredDealbreakerRule[] = [
      { field: "valuation", operator: "gt", value: 1_000, action: "reject" },
    ];
    expect(
      evaluateStructuredDealbreakers(snapshot({ valuation: null }), rules),
    ).toEqual([]);
  });

  it("emits stable reason codes that thread the action tier", () => {
    const rules: StructuredDealbreakerRule[] = [
      {
        id: "no-crypto",
        field: "industry",
        operator: "in",
        values: ["saas"],
        action: "reject",
      },
      {
        id: "small-rounds",
        field: "fundingTarget",
        operator: "lt",
        value: 5_000_000,
        action: "require_override",
      },
    ];
    const matches = evaluateStructuredDealbreakers(snapshot(), rules);
    expect(matches.map((m) => m.reasonCode)).toEqual([
      "dealbreaker:structured:no-crypto:reject",
      "dealbreaker:structured:small-rounds:require_override",
    ]);
  });
});
