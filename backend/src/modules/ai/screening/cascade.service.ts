import { Injectable } from "@nestjs/common";

/**
 * Smart re-run cascade — explicit invalidation rules.
 *
 * Per the architectural plan §7: "Hash inputs **plus** explicit cascade-
 * invalidation rules. Hash is an optimization, rules are the source of
 * truth. False-negative ("skipped something we should have re-run") is
 * unacceptable, so unknown changes default to full re-run."
 *
 * This service is the source of truth — given a change kind, it returns
 * the ordered list of screening phases that must re-run. Callers (the
 * smart-rerun orchestrator, the admin manual-rerun UI) plug into this map;
 * they never make their own decisions about what to invalidate.
 *
 * Phase order matches the pipeline execution order so callers can iterate
 * the returned array directly without re-sorting.
 */

/** Canonical change kinds. UNKNOWN_CHANGE is the failsafe — re-run everything. */
export type ScreeningChangeKind =
  | "DECK_UPLOADED"
  | "WEBSITE_CHANGE"
  | "TRACTION_FIELD_EDIT"
  | "FOUNDER_FIELD_EDIT"
  | "THESIS_EDIT"
  | "CLASSIFICATION_EDIT"
  | "UNKNOWN_CHANGE";

/** Phases the cascade can invalidate. */
export type ScreeningPhase =
  | "extraction"
  | "enrichment"
  | "scraping"
  | "gap-fill"
  | "classification"
  | "market"
  | "team"
  | "traction"
  | "fit"
  | "verdict";

const ALL_PHASES: ReadonlyArray<ScreeningPhase> = [
  "extraction",
  "enrichment",
  "scraping",
  "gap-fill",
  "classification",
  "market",
  "team",
  "traction",
  "fit",
  "verdict",
];

const RULES: Readonly<Record<ScreeningChangeKind, ReadonlyArray<ScreeningPhase>>> = {
  DECK_UPLOADED: [
    "extraction",
    "enrichment",
    "scraping",
    "gap-fill",
    "classification",
    "market",
    "team",
    "traction",
    "fit",
    "verdict",
  ],
  WEBSITE_CHANGE: ["scraping", "market", "fit", "verdict"],
  TRACTION_FIELD_EDIT: ["traction", "fit", "verdict"],
  FOUNDER_FIELD_EDIT: ["enrichment", "team", "fit", "verdict"],
  THESIS_EDIT: ["fit", "verdict"],
  CLASSIFICATION_EDIT: ["fit", "verdict"],
  UNKNOWN_CHANGE: ALL_PHASES,
};

@Injectable()
export class ScreeningCascadeService {
  /**
   * Returns the ordered list of phases to re-run when `change` happened.
   * Unknown / unmapped change kinds fall back to `UNKNOWN_CHANGE` (re-run
   * everything) — false-negatives are forbidden.
   */
  phasesToRerun(change: string): ScreeningPhase[] {
    const rule = RULES[change as ScreeningChangeKind] ?? RULES.UNKNOWN_CHANGE;
    return [...rule];
  }

  /**
   * Whether a specific phase must re-run given the change. Convenience for
   * callers that only care about one phase (e.g. "should we re-fit?").
   */
  shouldRerun(change: string, phase: ScreeningPhase): boolean {
    return this.phasesToRerun(change).includes(phase);
  }

  /** Every change kind known to the cascade. Useful for admin UIs. */
  knownChangeKinds(): ScreeningChangeKind[] {
    return Object.keys(RULES) as ScreeningChangeKind[];
  }

  /** Every phase the cascade can touch, in pipeline-execution order. */
  knownPhases(): ScreeningPhase[] {
    return [...ALL_PHASES];
  }
}
