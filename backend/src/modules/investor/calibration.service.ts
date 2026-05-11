import { Injectable } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { DrizzleService } from "../../database";
import { investorDealDecision } from "./entities/investor-deal-decision.schema";

export type TriageClassification = "advance" | "review" | "reject";
export type CalibrationDeltaType =
  | "aligned"
  | "false_positive"
  | "false_negative"
  | "soft_mismatch";

export interface CalibrationDecisionSnapshot {
  comparisonAvailable: boolean;
  mismatchType: CalibrationDeltaType | null;
  modelVerdict: TriageClassification | null;
  investorVerdict: "advance" | "pass" | "hold";
  reasonTags: string[];
}

export interface CalibrationReasonCount {
  reasonTag: string;
  count: number;
}

export interface CalibrationRecentMismatch {
  startupId: string;
  decidedAt: string;
  mismatchType: Exclude<CalibrationDeltaType, "aligned">;
  modelVerdict: TriageClassification;
  investorVerdict: "advance" | "pass" | "hold";
  reasonTags: string[];
}

/**
 * DS-E11-F2-S1 — DD-vs-Screening lens-delta aggregate. Surfaced
 * separately from `topOverrideReasons` so the investor-decision deltas
 * (calibration loop v1) stay interpretable independent of the
 * machine-vs-machine signal this field adds.
 */
export interface CalibrationLensDelta {
  lensKey: "team" | "market" | "traction";
  count: number;
  meanDelta: number;
  meanAbsDelta: number;
}

export interface CalibrationSummary {
  totalDecisions: number;
  /** Decisions where triageClassificationAtDecision was captured. */
  decisionsWithTriage: number;
  aligned: number;
  falsePositive: number;
  falseNegative: number;
  softMismatch: number;
  /**
   * 0..1, percentage of decisions-with-triage that aligned with the
   * model. `null` when there's no decision-with-triage data yet.
   */
  alignmentRate: number | null;
  topOverrideReasons: CalibrationReasonCount[];
  recentMismatches: CalibrationRecentMismatch[];
  /**
   * Per-lens mean delta between DD's final lens score and screening's
   * predicted lens score for the same pipeline run. Empty until the
   * first evaluation completes for a previously-screened deal under
   * this investor's matches.
   */
  lensDeltas: CalibrationLensDelta[];
}

interface CalibrationRow {
  verdict: "advance" | "pass" | "hold";
  triage: string | null;
  reasonTags: string[];
  startupId: string;
  decidedAt: Date | string;
}

const MAX_OVERRIDE_REASONS = 5;
const MAX_RECENT_MISMATCHES = 3;

function makeEmptySummary(): CalibrationSummary {
  return {
    totalDecisions: 0,
    decisionsWithTriage: 0,
    aligned: 0,
    falsePositive: 0,
    falseNegative: 0,
    softMismatch: 0,
    alignmentRate: null,
    topOverrideReasons: [],
    recentMismatches: [],
    lensDeltas: [],
  };
}

function uniqueTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const cleaned: string[] = [];
  for (const tag of tags) {
    const normalized = tag.trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    cleaned.push(normalized);
  }
  return cleaned;
}

export function classifyCalibrationDelta(
  triage: TriageClassification,
  verdict: "advance" | "pass" | "hold",
): CalibrationDeltaType {
  if (triage === "advance" && verdict === "pass") return "false_positive";
  if (triage === "reject" && verdict === "advance") return "false_negative";
  if (triage === "review" && (verdict === "advance" || verdict === "pass")) {
    return "soft_mismatch";
  }
  return "aligned";
}

export function buildDecisionCalibrationSnapshot(input: {
  verdict: "advance" | "pass" | "hold";
  triageClassificationAtDecision: string | null;
  reasonTags?: string[];
}): CalibrationDecisionSnapshot {
  const reasonTags = uniqueTags(input.reasonTags ?? []);
  const modelVerdict = input.triageClassificationAtDecision;
  const comparisonAvailable = modelVerdict === "advance" || modelVerdict === "review" || modelVerdict === "reject";

  return {
    comparisonAvailable,
    mismatchType: comparisonAvailable
      ? classifyCalibrationDelta(modelVerdict, input.verdict)
      : null,
    modelVerdict: comparisonAvailable ? modelVerdict : null,
    investorVerdict: input.verdict,
    reasonTags,
  };
}

export function summarizeCalibrationRows(rows: CalibrationRow[]): CalibrationSummary {
  if (rows.length === 0) return makeEmptySummary();

  const summary = makeEmptySummary();
  const reasonCounts = new Map<string, number>();
  const mismatches: CalibrationRecentMismatch[] = [];

  summary.totalDecisions = rows.length;

  for (const row of rows) {
    const triage = row.triage;
    if (triage !== "advance" && triage !== "review" && triage !== "reject") {
      continue;
    }

    summary.decisionsWithTriage += 1;

    const mismatchType = classifyCalibrationDelta(triage, row.verdict);
    if (mismatchType === "false_positive") {
      summary.falsePositive += 1;
    } else if (mismatchType === "false_negative") {
      summary.falseNegative += 1;
    } else if (mismatchType === "soft_mismatch") {
      summary.softMismatch += 1;
    } else {
      summary.aligned += 1;
    }

    if (mismatchType === "aligned") continue;

    const reasonTags = uniqueTags(row.reasonTags);
    mismatches.push({
      startupId: row.startupId,
      decidedAt: new Date(row.decidedAt).toISOString(),
      mismatchType,
      modelVerdict: triage,
      investorVerdict: row.verdict,
      reasonTags,
    });

    for (const tag of reasonTags) {
      reasonCounts.set(tag, (reasonCounts.get(tag) ?? 0) + 1);
    }
  }

  summary.alignmentRate =
    summary.decisionsWithTriage === 0
      ? null
      : summary.aligned / summary.decisionsWithTriage;

  summary.topOverrideReasons = [...reasonCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, MAX_OVERRIDE_REASONS)
    .map(([reasonTag, count]) => ({ reasonTag, count }));

  summary.recentMismatches = mismatches
    .sort((a, b) => b.decidedAt.localeCompare(a.decidedAt))
    .slice(0, MAX_RECENT_MISMATCHES);

  return summary;
}

/**
 * DS-E7-F3-S1 — calibration aggregates over the investor's recorded
 * decisions. The "loop" is the closed feedback path:
 *  1. Investor records a decision (DS-E11-F1-S1) with the system's
 *     triageClassificationAtDecision snapshotted at that moment.
 *  2. This service computes mismatch counts so the investor sees how
 *     the model is calibrated against their actual calls.
 *  3. A future ML pass can read the same rows to retune lens prompts /
 *     thresholds — that retune is out of scope for v1.
 *
 * Mismatch taxonomy (v1):
 *   - false_positive: triage=advance, investor=pass — model too eager
 *   - false_negative: triage=reject, investor=advance — model too harsh
 *   - soft_mismatch:  triage=review, investor decisive (advance/pass)
 *   - aligned:        all other combinations where the investor's call
 *                     is consistent with the model's bucket
 */
@Injectable()
export class CalibrationService {
  constructor(private readonly drizzle: DrizzleService) {}

  async getStatsForInvestor(investorId: string): Promise<CalibrationSummary> {
    const all = await this.drizzle.db
      .select({
        verdict: investorDealDecision.verdict,
        triage: investorDealDecision.triageClassificationAtDecision,
        reasonTags: investorDealDecision.reasonTags,
        startupId: investorDealDecision.startupId,
        decidedAt: investorDealDecision.decidedAt,
      })
      .from(investorDealDecision)
      .where(eq(investorDealDecision.investorId, investorId));

    if (all.length === 0) return makeEmptySummary();

    return summarizeCalibrationRows(all as CalibrationRow[]);
  }
}
