import { Injectable, Logger } from "@nestjs/common";
import { and, desc, eq } from "drizzle-orm";
import { DrizzleService } from "../../../../database";
import { LENS_FALLBACK_RATIONALE_PREFIX } from "../../lenses/base-lens.agent";
import {
  startupLensResult,
  type StartupLensResult,
} from "../../entities/lens-result.schema";
import type {
  ScreeningEvidence,
  ScreeningLensV1,
  ScreeningOutputV1,
  ScreeningOverallV1,
  ScreeningSignal,
} from "./v1.schema";

/**
 * Builds the public {@link ScreeningOutputV1} contract from persisted
 * `startup_lens_result` rows.
 *
 * This service is intentionally the ONLY component allowed to bridge between
 * Screening's storage layer and the public DD-facing contract. Future schema
 * changes (lens weights, new signals, etc.) bump the contract version in a
 * sibling file; this builder learns the new shape, but DD code keeps consuming
 * v1 until it opts in.
 */
@Injectable()
export class ScreeningOutputService {
  private readonly logger = new Logger(ScreeningOutputService.name);

  constructor(private readonly drizzle: DrizzleService) {}

  /**
   * Build a v1 ScreeningOutput for a startup. If `pipelineRunId` is supplied,
   * only rows from that run are considered; otherwise the most recent row per
   * lens key (across all runs) is used.
   *
   * Returns a contract even if zero lenses are present — the lens array will
   * be empty, overall.signal defaults to `review`, and overall.score to 0.
   * Callers wanting "no data" semantics should use {@link latestForStartup}.
   */
  async buildForStartup(
    startupId: string,
    pipelineRunId?: string | null,
  ): Promise<ScreeningOutputV1> {
    const rows = await this.fetchRows(startupId, pipelineRunId ?? null);
    const latestPerLens = this.pickLatestPerLens(rows);
    return this.assemble(startupId, pipelineRunId ?? null, latestPerLens);
  }

  /**
   * Returns the contract for the most recent pipeline run that produced at
   * least one lens row for this startup. Returns `null` when no rows exist.
   */
  async latestForStartup(
    startupId: string,
  ): Promise<ScreeningOutputV1 | null> {
    const rows = await this.fetchRows(startupId, null);
    if (rows.length === 0) {
      return null;
    }

    // Newest row wins; its pipelineRunId scopes the contract. Rows without a
    // run id (null) fall back to the cross-run "latest per lens" view.
    const newest = rows[0];
    if (newest.pipelineRunId) {
      const scoped = rows.filter(
        (row) => row.pipelineRunId === newest.pipelineRunId,
      );
      const latestPerLens = this.pickLatestPerLens(scoped);
      return this.assemble(startupId, newest.pipelineRunId, latestPerLens);
    }

    const latestPerLens = this.pickLatestPerLens(rows);
    return this.assemble(startupId, null, latestPerLens);
  }

  private async fetchRows(
    startupId: string,
    pipelineRunId: string | null,
  ): Promise<StartupLensResult[]> {
    const where =
      pipelineRunId === null
        ? eq(startupLensResult.startupId, startupId)
        : and(
            eq(startupLensResult.startupId, startupId),
            eq(startupLensResult.pipelineRunId, pipelineRunId),
          );

    return this.drizzle.db
      .select()
      .from(startupLensResult)
      .where(where)
      .orderBy(desc(startupLensResult.createdAt));
  }

  private pickLatestPerLens(
    rows: StartupLensResult[],
  ): StartupLensResult[] {
    // Rows arrive newest-first; first occurrence per key is the latest.
    const seen = new Set<string>();
    const out: StartupLensResult[] = [];
    for (const row of rows) {
      if (seen.has(row.lensKey)) continue;
      seen.add(row.lensKey);
      out.push(row);
    }
    return out;
  }

  private assemble(
    startupId: string,
    pipelineRunId: string | null,
    rows: StartupLensResult[],
  ): ScreeningOutputV1 {
    const lenses = rows.map((row) => this.toContractLens(row));
    return {
      version: 1,
      startupId,
      pipelineRunId,
      generatedAt: new Date().toISOString(),
      overall: this.computeOverall(lenses),
      lenses,
    };
  }

  private toContractLens(row: StartupLensResult): ScreeningLensV1 {
    return {
      key: row.lensKey,
      score: row.score,
      signal: this.coerceSignal(row.signal),
      rationale: row.rationale,
      evidence: this.coerceEvidence(row.evidence),
      modelId: row.modelId,
      promptKey: row.promptKey,
      latencyMs: row.latencyMs,
      // The lens base class writes a stable prefix on synthetic fallback
      // outputs (see LENS_FALLBACK_RATIONALE_PREFIX) so we can detect them
      // without a dedicated column. DS-E2-F1-S2 will replace this with a
      // real boolean column on `startup_lens_result`.
      usedFallback: row.rationale.startsWith(LENS_FALLBACK_RATIONALE_PREFIX),
    };
  }

  private coerceSignal(raw: string): ScreeningSignal {
    if (raw === "advance" || raw === "review" || raw === "reject") {
      return raw;
    }
    // Defensive: persisted rows are written by the screening processor with a
    // validated enum, but a stray value should not crash DD callers.
    this.logger.warn(
      `[ScreeningOutput] Unknown lens signal '${raw}' — coercing to 'review'.`,
    );
    return "review";
  }

  private coerceEvidence(raw: unknown): ScreeningEvidence[] {
    if (!Array.isArray(raw)) return [];
    const out: ScreeningEvidence[] = [];
    for (const item of raw) {
      if (
        item &&
        typeof item === "object" &&
        typeof (item as { claim?: unknown }).claim === "string"
      ) {
        const candidate = item as {
          claim: string;
          source?: unknown;
          confidence?: unknown;
        };
        out.push({
          claim: candidate.claim,
          source:
            typeof candidate.source === "string" ? candidate.source : undefined,
          confidence:
            candidate.confidence === "low" ||
            candidate.confidence === "medium" ||
            candidate.confidence === "high"
              ? candidate.confidence
              : "low",
        });
      }
    }
    return out;
  }

  /**
   * v1 aggregation policy:
   *   - score: simple unweighted average of lens scores, rounded to int.
   *     Weights are deferred to a later story; v1 keeps the math obvious so
   *     consumers can audit it.
   *   - signal: worst-of policy — any `reject` → reject; else any `review` →
   *     review; else `advance`. Empty lens array → `review` (no signal yet).
   *   - missingMaterials: always [] in v1; DS-E7-F4 fills this in once the
   *     missing-materials gate ships.
   */
  private computeOverall(lenses: ScreeningLensV1[]): ScreeningOverallV1 {
    if (lenses.length === 0) {
      return { score: 0, signal: "review", missingMaterials: [] };
    }

    const total = lenses.reduce((sum, l) => sum + l.score, 0);
    const score = Math.round(total / lenses.length);

    let signal: ScreeningSignal = "advance";
    for (const lens of lenses) {
      if (lens.signal === "reject") {
        signal = "reject";
        break;
      }
      if (lens.signal === "review") {
        signal = "review";
      }
    }

    return { score, signal, missingMaterials: [] };
  }
}
