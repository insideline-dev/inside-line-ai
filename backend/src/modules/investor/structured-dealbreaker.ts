// DS-E4-F3-S1 — structured dealbreaker rules: (field, operator, value[s], action).
//
// Investors author rules in a declarative form that beats narrative-text
// matching: operators handle ranges + negation, fields cover deal attributes
// beyond industry, and an explicit `action` tier separates hard REJECT from
// the soft REVIEW-with-override path partners actually want.

import { z } from "zod";

export const STRUCTURED_DEALBREAKER_FIELDS = [
  "industry",
  "stage",
  "geography",
  "fundingTarget",
  "valuation",
  "teamSize",
  "raiseType",
] as const;
export type StructuredDealbreakerField =
  (typeof STRUCTURED_DEALBREAKER_FIELDS)[number];

export const STRUCTURED_DEALBREAKER_OPERATORS = [
  "in",
  "not_in",
  "eq",
  "lt",
  "lte",
  "gt",
  "gte",
] as const;
export type StructuredDealbreakerOperator =
  (typeof STRUCTURED_DEALBREAKER_OPERATORS)[number];

export const STRUCTURED_DEALBREAKER_ACTIONS = [
  "reject",
  "require_override",
] as const;
export type StructuredDealbreakerAction =
  (typeof STRUCTURED_DEALBREAKER_ACTIONS)[number];

const StringValue = z.string().min(1).max(120);
const NumberValue = z.number().finite();

const InListOperator = z.enum(["in", "not_in"]);
const ComparisonOperator = z.enum(["eq", "lt", "lte", "gt", "gte"]);

// Numeric fields (fundingTarget, valuation, teamSize) accept comparison
// operators against a single numeric value. String fields (industry, stage,
// geography, raiseType) accept IN / NOT IN against a value list.
const StringRule = z.object({
  id: z.string().min(1).max(64).optional(),
  field: z.enum(["industry", "stage", "geography", "raiseType"]),
  operator: InListOperator,
  values: z.array(StringValue).min(1).max(50),
  action: z.enum(STRUCTURED_DEALBREAKER_ACTIONS).default("reject"),
  label: z.string().max(200).optional(),
});

const NumericRule = z.object({
  id: z.string().min(1).max(64).optional(),
  field: z.enum(["fundingTarget", "valuation", "teamSize"]),
  operator: ComparisonOperator,
  value: NumberValue,
  action: z.enum(STRUCTURED_DEALBREAKER_ACTIONS).default("reject"),
  label: z.string().max(200).optional(),
});

export const StructuredDealbreakerRuleSchema = z.union([StringRule, NumericRule]);
export type StructuredDealbreakerRule = z.infer<
  typeof StructuredDealbreakerRuleSchema
>;

export const StructuredDealbreakerRuleListSchema = z
  .array(StructuredDealbreakerRuleSchema)
  .max(100);

/**
 * Minimal startup projection used by the rule evaluator. Mirrors the screening
 * triage snapshot but typed independently so this module stays portable.
 */
export interface DealbreakerStartupSnapshot {
  industry: string | null;
  sectorIndustry: string | null;
  sectorIndustryGroup: string | null;
  stage: string | null;
  location: string | null;
  fundingTarget: number | null;
  valuation: number | null;
  teamSize?: number | null;
  raiseType: string | null;
}

export interface StructuredRuleMatch {
  rule: StructuredDealbreakerRule;
  reasonCode: string;
}

const STRUCTURED_REASON_PREFIX = "dealbreaker:structured:";

function normalizeStr(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Bidirectional case-insensitive substring match — same shape the F4-F1
 * boundary check uses, so structured rules behave consistently with the
 * thesis IN-list checks.
 */
function fuzzyMatch(haystack: string, needle: string): boolean {
  const h = haystack.trim().toLowerCase();
  const n = needle.trim().toLowerCase();
  if (!h || !n) return false;
  return h === n || h.includes(n) || n.includes(h);
}

function candidateStringValues(
  snapshot: DealbreakerStartupSnapshot,
  field: StructuredDealbreakerField,
): string[] {
  switch (field) {
    case "industry":
      return [
        snapshot.industry,
        snapshot.sectorIndustry,
        snapshot.sectorIndustryGroup,
      ].filter((v): v is string => typeof v === "string" && v.trim().length > 0);
    case "stage":
      return snapshot.stage ? [snapshot.stage] : [];
    case "geography":
      return snapshot.location ? [snapshot.location] : [];
    case "raiseType":
      return snapshot.raiseType ? [snapshot.raiseType] : [];
    default:
      return [];
  }
}

function candidateNumericValue(
  snapshot: DealbreakerStartupSnapshot,
  field: StructuredDealbreakerField,
): number | null {
  switch (field) {
    case "fundingTarget":
      return snapshot.fundingTarget ?? null;
    case "valuation":
      return snapshot.valuation ?? null;
    case "teamSize":
      return snapshot.teamSize ?? null;
    default:
      return null;
  }
}

function describeRule(rule: StructuredDealbreakerRule): string {
  if (rule.label && rule.label.trim().length > 0) return rule.label.trim();
  if ("values" in rule) {
    return `${rule.field} ${rule.operator.replace("_", " ")} {${rule.values.join(", ")}}`;
  }
  return `${rule.field} ${rule.operator} ${rule.value}`;
}

function reasonCodeFor(rule: StructuredDealbreakerRule, idx: number): string {
  const key = rule.id?.trim() || `rule-${idx}`;
  return `${STRUCTURED_REASON_PREFIX}${key}:${rule.action}`;
}

function evaluateStringRule(
  rule: StructuredDealbreakerRule & { values: string[] },
  snapshot: DealbreakerStartupSnapshot,
): boolean {
  const candidates = candidateStringValues(snapshot, rule.field);
  if (candidates.length === 0) {
    // Missing data: NOT IN trips (the field's value is not in the list,
    // because there's no value); IN doesn't (we can't confirm membership).
    return rule.operator === "not_in";
  }

  const anyHit = candidates.some((c) =>
    rule.values.some((v) => fuzzyMatch(c, v)),
  );
  return rule.operator === "in" ? anyHit : !anyHit;
}

function evaluateNumericRule(
  rule: StructuredDealbreakerRule & { value: number },
  snapshot: DealbreakerStartupSnapshot,
): boolean {
  const candidate = candidateNumericValue(snapshot, rule.field);
  if (candidate === null) return false; // can't evaluate a comparison on missing data
  switch (rule.operator) {
    case "eq":
      return candidate === rule.value;
    case "lt":
      return candidate < rule.value;
    case "lte":
      return candidate <= rule.value;
    case "gt":
      return candidate > rule.value;
    case "gte":
      return candidate >= rule.value;
    default:
      return false;
  }
}

/**
 * Evaluate every structured rule against the snapshot. Returns the rules that
 * matched, in author-supplied order. Caller picks how to translate matches
 * into verdict outcomes — typically: any `reject` match → REJECT, otherwise
 * any `require_override` match → REVIEW with an override gate.
 */
export function evaluateStructuredDealbreakers(
  snapshot: DealbreakerStartupSnapshot | null,
  rules: StructuredDealbreakerRule[],
): StructuredRuleMatch[] {
  if (!snapshot || rules.length === 0) return [];

  const matches: StructuredRuleMatch[] = [];
  rules.forEach((rule, idx) => {
    const hit =
      "values" in rule
        ? evaluateStringRule(rule, snapshot)
        : evaluateNumericRule(rule, snapshot);
    if (!hit) return;
    matches.push({
      rule,
      reasonCode: reasonCodeFor(rule, idx),
    });
  });

  return matches;
}

export function summarizeStructuredMatch(match: StructuredRuleMatch): string {
  const verb = match.rule.action === "reject" ? "rejects" : "needs override";
  return `${describeRule(match.rule)} — ${verb}`;
}

export function isRequireOverrideReasonCode(code: string): boolean {
  return (
    code.startsWith(STRUCTURED_REASON_PREFIX) && code.endsWith(":require_override")
  );
}

export function isStructuredRejectReasonCode(code: string): boolean {
  return code.startsWith(STRUCTURED_REASON_PREFIX) && code.endsWith(":reject");
}
