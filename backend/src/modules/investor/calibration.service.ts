import { Injectable, Logger } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { DrizzleService } from "../../database";
import { investorDealDecision } from "./entities/investor-deal-decision.schema";

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
export interface CalibrationStats {
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
}

const ZERO_STATS: CalibrationStats = {
  totalDecisions: 0,
  decisionsWithTriage: 0,
  aligned: 0,
  falsePositive: 0,
  falseNegative: 0,
  softMismatch: 0,
  alignmentRate: null,
};

@Injectable()
export class CalibrationService {
  private readonly logger = new Logger(CalibrationService.name);

  constructor(private readonly drizzle: DrizzleService) {}

  async getStatsForInvestor(investorId: string): Promise<CalibrationStats> {
    const all = await this.drizzle.db
      .select({
        verdict: investorDealDecision.verdict,
        triage: investorDealDecision.triageClassificationAtDecision,
      })
      .from(investorDealDecision)
      .where(eq(investorDealDecision.investorId, investorId));

    if (all.length === 0) return ZERO_STATS;

    type RowWithTriage = (typeof all)[number] & { triage: string };
    const withTriage = all.filter(
      (row): row is RowWithTriage =>
        typeof row.triage === "string" && row.triage.length > 0,
    );

    let aligned = 0;
    let falsePositive = 0;
    let falseNegative = 0;
    let softMismatch = 0;

    for (const row of withTriage) {
      const v = row.verdict;
      const t = row.triage;

      if (t === "advance" && v === "pass") {
        falsePositive++;
      } else if (t === "reject" && v === "advance") {
        falseNegative++;
      } else if (t === "review" && (v === "advance" || v === "pass")) {
        softMismatch++;
      } else {
        // advance/advance, advance/hold, reject/pass, reject/hold,
        // review/hold all considered aligned (investor agreed or
        // hedged within the model's bucket).
        aligned++;
      }
    }

    const alignmentRate =
      withTriage.length === 0 ? null : aligned / withTriage.length;

    return {
      totalDecisions: all.length,
      decisionsWithTriage: withTriage.length,
      aligned,
      falsePositive,
      falseNegative,
      softMismatch,
      alignmentRate,
    };
  }
}
