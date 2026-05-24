import { Injectable, Logger } from "@nestjs/common";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { DrizzleService } from "../../database";
import { screeningDecision } from "../ai/entities/screening-decision.schema";
import { startup } from "../startup/entities/startup.schema";

/**
 * Screening-side calibration ("worth my time?").
 *
 * The existing `CalibrationProposalService` learns from DD signals — close /
 * pass decisions, memo overrides, lens-vs-evaluation deltas. That answers
 * "worth my money?" and shouldn't be conflated with screening-stage
 * calibration.
 *
 * Per plan §8, screening calibration uses different signal sources:
 *   - REVIEW → PASS decisions (investor read the deal, didn't want it)
 *   - REVIEW → ADVANCE decisions (investor wanted DD on it)
 *   - REJECT verdicts the system generated automatically
 *
 * Output is a read-only proposals list (no persistence layer yet — the
 * shape mirrors `CalibrationProposal` but proposals are recomputed on
 * read, not stored, to keep blast radius small for the first iteration).
 *
 * Trigger thresholds are intentionally loose so a quiet investor still
 * gets useful signal; tune up once we have real usage data.
 */

export interface ScreeningCalibrationProposal {
  /** Stable proposal kind discriminator. */
  kind: ScreeningCalibrationProposalKind;
  /** Short human-readable line shown in the calibration card. */
  summary: string;
  /** Longer rationale (2-4 sentences) shown when the card is expanded. */
  rationale: string;
  /**
   * Lens key the proposal centres on, if any. Used by the UI to render the
   * proposal alongside the right lens row.
   */
  lensKey?: "market" | "team" | "traction";
  /** Sample of decisions the proposal was computed from. */
  evidenceCount: number;
}

export type ScreeningCalibrationProposalKind =
  | "high_reject_rate"
  | "high_review_rate"
  | "lens_rejects_dominant"
  | "thesis_too_narrow";

/** Tunable thresholds (kept here so future calibration knobs are obvious). */
const CONFIG = {
  /** Minimum decisions in the window before any proposal fires. */
  minDecisions: 5,
  /** Rolling window for signal computation. */
  windowDays: 30,
  /** Reject-rate above which we flag "thesis_too_narrow". */
  highRejectRate: 0.7,
  /** Review-rate above which we flag "high_review_rate" (decision fatigue). */
  highReviewRate: 0.6,
  /**
   * Per-lens dominance ratio: if a single lens accounts for >= this share of
   * reasons in reject decisions, surface "lens_rejects_dominant" for it.
   */
  lensDominance: 0.5,
} as const;

interface DecisionRow {
  classification: string;
  reason_codes: string[];
  created_at: Date;
}

@Injectable()
export class ScreeningCalibrationService {
  private readonly logger = new Logger(ScreeningCalibrationService.name);

  constructor(private readonly drizzle: DrizzleService) {}

  /**
   * Pull the most recent N screening decisions for an investor's startups,
   * tally verdict distribution + lens-reason dominance, and emit proposals
   * for any pattern that crosses the configured threshold.
   *
   * Read-only — no DB writes, no event log entry. UI consumers should
   * re-fetch when the user lands on the calibration page.
   */
  async listForInvestor(
    investorUserId: string,
  ): Promise<ScreeningCalibrationProposal[]> {
    const decisions = await this.fetchRecentDecisions(investorUserId);
    if (decisions.length < CONFIG.minDecisions) return [];
    return computeProposals(decisions);
  }

  private async fetchRecentDecisions(
    investorUserId: string,
  ): Promise<DecisionRow[]> {
    const cutoff = new Date(Date.now() - CONFIG.windowDays * 24 * 60 * 60 * 1000);
    const rows = await this.drizzle.db
      .select({
        classification: screeningDecision.classification,
        reason_codes: screeningDecision.reasonCodes,
        created_at: screeningDecision.createdAt,
      })
      .from(screeningDecision)
      .innerJoin(startup, eq(startup.id, screeningDecision.startupId))
      .where(
        and(
          eq(startup.userId, investorUserId),
          gte(screeningDecision.createdAt, cutoff),
        ),
      )
      .orderBy(desc(screeningDecision.createdAt));
    return rows as DecisionRow[];
  }
}

/**
 * Pure proposal computation — extracted so the unit test can drive it with
 * fixture rows without spinning up the DI graph.
 */
export function computeProposals(
  decisions: DecisionRow[],
): ScreeningCalibrationProposal[] {
  if (decisions.length < CONFIG.minDecisions) return [];
  const out: ScreeningCalibrationProposal[] = [];
  const total = decisions.length;
  const rejectCount = decisions.filter((d) => d.classification === "reject").length;
  const reviewCount = decisions.filter((d) => d.classification === "review").length;
  const advanceCount = decisions.filter((d) => d.classification === "advance").length;

  const rejectRate = rejectCount / total;
  const reviewRate = reviewCount / total;

  if (rejectRate >= CONFIG.highRejectRate) {
    out.push({
      kind: "thesis_too_narrow",
      summary: `${Math.round(rejectRate * 100)}% of recent deals were rejected — your thesis may be too narrow.`,
      rationale: `In the last ${CONFIG.windowDays} days, ${rejectCount} of ${total} deals were auto-rejected at screening. Consider broadening one criterion (geography, stage, sector, or check size) so good-fit deals don't get filtered out before you see them.`,
      evidenceCount: rejectCount,
    });
  }

  if (reviewRate >= CONFIG.highReviewRate) {
    out.push({
      kind: "high_review_rate",
      summary: `${Math.round(reviewRate * 100)}% of recent deals landed in REVIEW — consider tightening the thesis.`,
      rationale: `In the last ${CONFIG.windowDays} days, ${reviewCount} of ${total} deals required manual triage. A tighter sector or stage filter could pre-decide more of these automatically.`,
      evidenceCount: reviewCount,
    });
  }

  // Lens-reason dominance — only counted on reject rows since those expose
  // why the system filtered out the deal. Reason codes follow
  // `lens.<key>.<verdict>` (e.g. `lens.team.reject`).
  const lensRejectCounts: Record<"market" | "team" | "traction", number> = {
    market: 0,
    team: 0,
    traction: 0,
  };
  let totalLensRejects = 0;
  for (const d of decisions) {
    if (d.classification !== "reject") continue;
    for (const code of d.reason_codes ?? []) {
      if (!code.startsWith("lens.")) continue;
      const parts = code.split(".");
      const lens = parts[1] as "market" | "team" | "traction";
      const verdict = parts[2];
      if (verdict !== "reject") continue;
      if (lens in lensRejectCounts) {
        lensRejectCounts[lens] += 1;
        totalLensRejects += 1;
      }
    }
  }
  if (totalLensRejects >= CONFIG.minDecisions) {
    for (const lens of ["market", "team", "traction"] as const) {
      const share = lensRejectCounts[lens] / totalLensRejects;
      if (share >= CONFIG.lensDominance) {
        out.push({
          kind: "lens_rejects_dominant",
          summary: `${lens[0].toUpperCase()}${lens.slice(1)} lens drives ${Math.round(share * 100)}% of rejects.`,
          rationale: `Out of ${totalLensRejects} rejected deals with lens flags, ${lensRejectCounts[lens]} (${Math.round(share * 100)}%) failed on ${lens}. Either the ${lens} bar is too high for this thesis, or the lens prompt is over-strict — check a few sample rejections.`,
          lensKey: lens,
          evidenceCount: lensRejectCounts[lens],
        });
      }
    }
  }

  // Touch advanceCount so an all-advance window still produces no spurious
  // alerts. (Counted in case future proposal kinds need it.)
  void advanceCount;
  return out;
}
