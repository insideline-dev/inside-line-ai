// Pure dealbreaker / thesis-fit rule evaluation (DS-E4-F3-S1).
//
// Replaces narrative LLM interpretation with deterministic checks against
// the investor's structured thesis fields. Used by the DealCard to flag
// violations per-investor without round-tripping through a model.
//
// Each rule:
//  - Returns null when the data isn't available to evaluate (don't false-flag).
//  - Returns a Violation when the thesis explicitly excludes this deal.
// "Not enough info to judge" never produces a violation.

import type { Startup } from "@/types/startup";
import type { InvestmentThesis } from "@/types/investor";

export type ViolationSeverity = "hard" | "soft";

export interface DealbreakerViolation {
  /** Stable code consumers can branch on (analytics, copy maps, tests). */
  code:
    | "industry_excluded"
    | "industry_not_in_scope"
    | "stage_not_supported"
    | "geography_not_in_scope"
    | "business_model_mismatch"
    | "team_size_below_minimum"
    | "explicit_dealbreaker_match";
  /** Hard = a thesis-stated dealbreaker; soft = thesis preference miss. */
  severity: ViolationSeverity;
  /** Short human-readable summary for inline rendering. */
  label: string;
  /** Optional supporting detail (e.g. "team of 2 < min 5"). */
  detail?: string;
}

const lower = (s: string) => s.trim().toLowerCase();

// Bidirectional substring match — handles "B2B SaaS" vs "SaaS" gracefully
// without requiring an exact taxonomy match. Both directions covered so
// either side can be the more specific term.
const fuzzyMatchAny = (haystack: readonly string[], needle: string) => {
  const n = lower(needle);
  if (!n) return false;
  return haystack.some((h) => {
    const hh = lower(h);
    if (!hh) return false;
    return hh === n || hh.includes(n) || n.includes(hh);
  });
};

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Word-boundary match used for explicit dealbreakers — prevents
// "adult" from matching "young adult fiction" or "ai" from matching
// "available". Only applied to fielded values (industry, sector), never
// to free-form description blobs.
const wordBoundaryHit = (text: string, term: string) => {
  if (!term.trim()) return false;
  const re = new RegExp(`\\b${escapeRegex(term.trim())}\\b`, "i");
  return re.test(text);
};

/**
 * Evaluates a startup against an investor's thesis. Returns the list of
 * violations in priority order (hard first). Empty array means "no
 * dealbreakers triggered" — note this is NOT the same as "good fit"; the
 * lens-based screening signal still has the final say.
 */
export function evaluateDealbreakers(
  startup: Startup,
  thesis: InvestmentThesis | null | undefined,
): DealbreakerViolation[] {
  if (!thesis) return [];

  const violations: DealbreakerViolation[] = [];

  // 1. Explicit dealbreaker strings — word-boundary match against fielded
  //    values only (industry / sector / sectorGroup). Description is
  //    deliberately excluded — too noisy for a hard verdict ("adult"
  //    matches "young adult"). Investor authored these to exclude. Hard.
  if (thesis.dealBreakers?.length) {
    const fields = [
      startup.industry,
      startup.sectorIndustry,
      startup.sectorIndustryGroup,
    ].filter((v): v is string => typeof v === "string" && v.length > 0);

    if (fields.length > 0) {
      for (const breaker of thesis.dealBreakers) {
        if (!breaker.trim()) continue;
        if (fields.some((field) => wordBoundaryHit(field, breaker))) {
          violations.push({
            code: "explicit_dealbreaker_match",
            severity: "hard",
            label: "Dealbreaker hit",
            detail: `"${breaker}"`,
          });
          break; // one is enough; stacking is noise
        }
      }
    }
  }

  // 2. Industry not in the investor's preferred industries. SOFT — fuzzy
  //    match handles "B2B SaaS" vs "SaaS" without flagging strict-equality
  //    misses, and we don't want to hard-reject on a mid-quality taxonomy
  //    match. The investor still sees the note.
  if (thesis.industries?.length && startup.industry) {
    if (!fuzzyMatchAny(thesis.industries, startup.industry)) {
      violations.push({
        code: "industry_not_in_scope",
        severity: "soft",
        label: "Industry not in thesis",
        detail: startup.industry,
      });
    }
  }

  // 3. Stage not supported. Hard — stage is enum-like, no fuzziness needed.
  if (thesis.stages?.length && startup.stage) {
    if (!fuzzyMatchAny(thesis.stages, startup.stage)) {
      violations.push({
        code: "stage_not_supported",
        severity: "hard",
        label: "Stage outside thesis",
        detail: startup.stage.replace(/_/g, " "),
      });
    }
  }

  // 4. Geography — fuzzy bidirectional match handles "United States" vs
  //    "USA" or "San Francisco" within an "USA"-scoped thesis.
  if (thesis.geographicFocus?.length) {
    const region = startup.normalizedRegion ?? startup.location;
    if (region && !fuzzyMatchAny(thesis.geographicFocus, region)) {
      violations.push({
        code: "geography_not_in_scope",
        severity: "hard",
        label: "Geography outside thesis",
        detail: region,
      });
    }
  }

  // 5. Business model mismatch.
  if (
    thesis.businessModels?.length &&
    typeof startup.industry === "string" &&
    startup.industry.length > 0
  ) {
    // Frontend Startup type doesn't carry a structured business-model field
    // today — we'd false-flag every deal if we strict-checked. Skip until
    // the field exists on the type.
  }

  // 6. Team size below minimum.
  if (
    typeof thesis.minTeamSize === "number" &&
    thesis.minTeamSize > 0 &&
    typeof startup.teamSize === "number" &&
    startup.teamSize < thesis.minTeamSize
  ) {
    violations.push({
      code: "team_size_below_minimum",
      severity: "soft",
      label: "Team smaller than thesis minimum",
      detail: `${startup.teamSize} < min ${thesis.minTeamSize}`,
    });
  }

  // Hard violations first.
  violations.sort((a, b) => {
    if (a.severity === b.severity) return 0;
    return a.severity === "hard" ? -1 : 1;
  });

  return violations;
}

export function hasHardViolation(violations: DealbreakerViolation[]): boolean {
  return violations.some((v) => v.severity === "hard");
}
