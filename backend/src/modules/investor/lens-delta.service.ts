import { Injectable, Logger } from "@nestjs/common";
import { and, desc, eq } from "drizzle-orm";
import { DrizzleService } from "../../database";
import { startupLensResult } from "../ai/entities/lens-result.schema";
import {
  screeningDdLensDelta,
  LENS_DELTA_KEYS,
  type LensDeltaKey,
  type ScreeningDdLensDeltaRow,
} from "./entities/screening-dd-lens-delta.schema";
import { startupMatch } from "./entities/investor.schema";

/**
 * Aggregate stat per lens used in the calibration summary.
 *  - `count`: number of (startup, lensKey) pairs contributing
 *  - `meanDelta`: average signed delta — positive means DD consistently
 *    scores higher than screening.
 *  - `meanAbsDelta`: average absolute delta — magnitude of disagreement
 *    regardless of direction. Useful when sign cancels out.
 */
export interface LensDeltaSummary {
  lensKey: LensDeltaKey;
  count: number;
  meanDelta: number;
  meanAbsDelta: number;
}

interface LensDeltaSummaryRow {
  startupId: string;
  lensKey: string;
  delta: number;
  computedAt: Date | string;
}

/**
 * Cap on how many recent deals contribute to a single investor's
 * lens-delta aggregate. The AC says "latest per startup, all time" —
 * this is a safety upper bound so the summary stays O(1) at scale
 * (e.g. when a high-volume investor accumulates thousands of deals).
 * 50 keeps a quarter+ of real signal for active investors while
 * trimming long-tail noise.
 */
export const LENS_DELTA_DEAL_WINDOW = 50;

/**
 * Pure aggregator — separately testable from any I/O. Filters to the
 * latest (startupId, lensKey) by computedAt, optionally caps to the
 * most recent `dealWindow` startups, then averages by lens.
 *
 * Returns one entry per lens key that has at least one contributing
 * row. Empty input yields an empty array (NOT zero-filled entries) so
 * callers can decide whether to render "no data yet" copy.
 */
export function summarizeLensDeltas(
  rows: readonly LensDeltaSummaryRow[],
  dealWindow: number = LENS_DELTA_DEAL_WINDOW,
): LensDeltaSummary[] {
  if (rows.length === 0) return [];

  // Latest row per (startupId, lensKey) — same startup with multiple
  // pipeline runs only contributes its newest delta.
  const latestByPair = new Map<string, LensDeltaSummaryRow>();
  for (const row of rows) {
    const key = `${row.startupId}::${row.lensKey}`;
    const existing = latestByPair.get(key);
    if (!existing) {
      latestByPair.set(key, row);
      continue;
    }
    if (toMillis(row.computedAt) > toMillis(existing.computedAt)) {
      latestByPair.set(key, row);
    }
  }

  // Sort startups by their newest delta (most recent first) and
  // truncate to the deal window.
  const newestByStartup = new Map<string, number>();
  for (const row of latestByPair.values()) {
    const ms = toMillis(row.computedAt);
    const cur = newestByStartup.get(row.startupId) ?? 0;
    if (ms > cur) newestByStartup.set(row.startupId, ms);
  }
  const windowedStartups = new Set(
    [...newestByStartup.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, Math.max(0, dealWindow))
      .map(([startupId]) => startupId),
  );

  const buckets = new Map<
    LensDeltaKey,
    { totalSigned: number; totalAbs: number; count: number }
  >();

  for (const row of latestByPair.values()) {
    if (!windowedStartups.has(row.startupId)) continue;
    if (!isLensDeltaKey(row.lensKey)) continue;
    const bucket = buckets.get(row.lensKey) ?? {
      totalSigned: 0,
      totalAbs: 0,
      count: 0,
    };
    bucket.totalSigned += row.delta;
    bucket.totalAbs += Math.abs(row.delta);
    bucket.count += 1;
    buckets.set(row.lensKey, bucket);
  }

  const summaries: LensDeltaSummary[] = [];
  for (const lensKey of LENS_DELTA_KEYS) {
    const bucket = buckets.get(lensKey);
    if (!bucket || bucket.count === 0) continue;
    summaries.push({
      lensKey,
      count: bucket.count,
      meanDelta: round1(bucket.totalSigned / bucket.count),
      meanAbsDelta: round1(bucket.totalAbs / bucket.count),
    });
  }
  return summaries;
}

function isLensDeltaKey(value: string): value is LensDeltaKey {
  return value === "team" || value === "market" || value === "traction";
}

function toMillis(value: Date | string): number {
  return value instanceof Date ? value.getTime() : new Date(value).getTime();
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * Input shape for the evaluation-completion hook. Mirrors the subset of
 * `EvaluationResult` we actually read so the service stays decoupled
 * from the full evaluation interface (and easy to mock in tests).
 */
export interface EvaluationLensScoresInput {
  team?: { score: number } | null;
  market?: { score: number } | null;
  traction?: { score: number } | null;
  /** Optional version stamp for the DD agent run (model id, prompt hash, etc). */
  ddAgentVersion?: string | null;
}

export interface ComputeLensDeltasInput {
  startupId: string;
  pipelineRunId: string | null;
  evaluation: EvaluationLensScoresInput;
}

/**
 * DS-E11-F2-S1 — owns the per-deal lens delta history.
 *
 *   - `computeAndPersistForEvaluation` runs on the evaluation completion
 *     hook (called from `EvaluationProcessor`). Reads screening lens
 *     results for the same pipeline run, computes the signed delta per
 *     overlapping lens, and upserts a row per lens.
 *   - `summarizeLensDeltas` (the pure function above) folds the table
 *     into a per-investor aggregate. Called from the calibration
 *     recompute job so the snapshot stays the unifying read.
 *   - `getLatestDeltasForInvestor` reads the rows that feed the
 *     summary. Kept on the service so the recompute job stays a thin
 *     orchestrator.
 *
 * Why no new BullMQ queue: the math is tiny (3 lens scores × 1 row
 * upsert each) and reads ride the existing screening-lens index. Inline
 * during evaluation completion is cheaper than enqueueing a follow-up.
 *
 * Why skip silently on no-match cases: the AC says "if a DD run
 * produces no comparable lens score (e.g. an evaluation agent fell
 * back), the row is skipped (not zero-filled)" and the same logic
 * applies when no screening row exists for the same pipeline run.
 * Zero-filling would corrupt the calibration signal.
 */
@Injectable()
export class LensDeltaService {
  private readonly logger = new Logger(LensDeltaService.name);

  constructor(private readonly drizzle: DrizzleService) {}

  async computeAndPersistForEvaluation(
    input: ComputeLensDeltasInput,
  ): Promise<ScreeningDdLensDeltaRow[]> {
    const { startupId, pipelineRunId, evaluation } = input;

    if (!pipelineRunId) {
      // Without a pipeline-run anchor we can't pair screening to DD
      // unambiguously; skip silently.
      return [];
    }

    const ddScores = this.readDdScores(evaluation);
    if (ddScores.size === 0) {
      this.logger.debug(
        `[LensDelta] No comparable DD lens scores for startup=${startupId} run=${pipelineRunId}; skipping`,
      );
      return [];
    }

    // Latest screening lens result per lensKey for this pipeline run.
    // Multiple rows per (startupId, pipelineRunId, lensKey) shouldn't
    // happen (screening upserts) but if it ever does the `desc(createdAt)`
    // order picks the newest.
    const screeningRows = await this.drizzle.db
      .select({
        lensKey: startupLensResult.lensKey,
        score: startupLensResult.score,
        modelId: startupLensResult.modelId,
        promptKey: startupLensResult.promptKey,
        createdAt: startupLensResult.createdAt,
      })
      .from(startupLensResult)
      .where(
        and(
          eq(startupLensResult.startupId, startupId),
          eq(startupLensResult.pipelineRunId, pipelineRunId),
        ),
      )
      .orderBy(desc(startupLensResult.createdAt));

    if (screeningRows.length === 0) {
      this.logger.debug(
        `[LensDelta] No screening lens results for startup=${startupId} run=${pipelineRunId}; skipping`,
      );
      return [];
    }

    const screeningByLens = new Map<
      string,
      { score: number; version: string }
    >();
    for (const row of screeningRows) {
      if (screeningByLens.has(row.lensKey)) continue; // already have newest
      screeningByLens.set(row.lensKey, {
        score: row.score,
        version: `${row.modelId}:${row.promptKey}`,
      });
    }

    const investorId = await this.resolveInvestorId(startupId);
    const now = new Date();
    const inserted: ScreeningDdLensDeltaRow[] = [];

    for (const lensKey of LENS_DELTA_KEYS) {
      const dd = ddScores.get(lensKey);
      const screening = screeningByLens.get(lensKey);
      if (dd === undefined || !screening) continue;

      const delta = dd - screening.score;
      const [row] = await this.drizzle.db
        .insert(screeningDdLensDelta)
        .values({
          startupId,
          pipelineRunId,
          investorId,
          lensKey,
          screeningScore: screening.score,
          ddScore: dd,
          delta,
          screeningLensVersion: screening.version,
          ddAgentVersion: evaluation.ddAgentVersion ?? null,
          computedAt: now,
        })
        .onConflictDoUpdate({
          target: [
            screeningDdLensDelta.startupId,
            screeningDdLensDelta.pipelineRunId,
            screeningDdLensDelta.lensKey,
          ],
          set: {
            screeningScore: screening.score,
            ddScore: dd,
            delta,
            screeningLensVersion: screening.version,
            ddAgentVersion: evaluation.ddAgentVersion ?? null,
            investorId,
            computedAt: now,
          },
        })
        .returning();

      if (row) inserted.push(row);
    }

    if (inserted.length > 0) {
      this.logger.log(
        `[LensDelta] Persisted ${inserted.length} delta row(s) for startup=${startupId} run=${pipelineRunId} investor=${investorId ?? "none"}`,
      );
    }

    return inserted;
  }

  /**
   * Reads the lens-delta rows that should feed `summarizeLensDeltas`
   * for one investor. Caps via `LENS_DELTA_DEAL_WINDOW * 3` (3 lenses
   * per deal) so the recompute summary aggregation stays bounded.
   */
  async getLatestDeltasForInvestor(
    investorId: string,
    dealWindow: number = LENS_DELTA_DEAL_WINDOW,
  ): Promise<LensDeltaSummaryRow[]> {
    const rows = await this.drizzle.db
      .select({
        startupId: screeningDdLensDelta.startupId,
        lensKey: screeningDdLensDelta.lensKey,
        delta: screeningDdLensDelta.delta,
        computedAt: screeningDdLensDelta.computedAt,
      })
      .from(screeningDdLensDelta)
      .where(eq(screeningDdLensDelta.investorId, investorId))
      .orderBy(desc(screeningDdLensDelta.computedAt))
      .limit(Math.max(1, dealWindow * LENS_DELTA_KEYS.length));

    return rows;
  }

  /**
   * Resolves the investor for a startup at evaluation-time. Uses the
   * highest-scoring active match (`isSaved` first, then highest
   * `overallScore`) as the canonical owner. Returns null when no match
   * exists — the row still persists for system-wide telemetry but the
   * per-investor summary won't include it.
   */
  private async resolveInvestorId(startupId: string): Promise<string | null> {
    const [match] = await this.drizzle.db
      .select({
        investorId: startupMatch.investorId,
      })
      .from(startupMatch)
      .where(eq(startupMatch.startupId, startupId))
      .orderBy(
        desc(startupMatch.isSaved),
        desc(startupMatch.overallScore),
        desc(startupMatch.createdAt),
      )
      .limit(1);

    return match?.investorId ?? null;
  }

  private readDdScores(
    evaluation: EvaluationLensScoresInput,
  ): Map<LensDeltaKey, number> {
    const out = new Map<LensDeltaKey, number>();
    const pairs: Array<[LensDeltaKey, { score: number } | null | undefined]> = [
      ["team", evaluation.team],
      ["market", evaluation.market],
      ["traction", evaluation.traction],
    ];
    for (const [key, value] of pairs) {
      const score = value?.score;
      if (
        typeof score === "number" &&
        Number.isFinite(score) &&
        score >= 0 &&
        score <= 100
      ) {
        out.set(key, Math.round(score));
      }
    }
    return out;
  }
}

