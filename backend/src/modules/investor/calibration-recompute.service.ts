import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { DrizzleService } from "../../database";
import { QueueService } from "../../queue/queue.service";
import { QUEUE_NAMES } from "../../queue/queue.config";
import { user, UserRole } from "../../auth/entities/auth.schema";
import { summarizeCalibrationRows, type CalibrationSummary } from "./calibration.service";
import { LensDeltaService, summarizeLensDeltas } from "./lens-delta.service";
import { investorDealDecision } from "./entities/investor-deal-decision.schema";
import {
  investorCalibrationSnapshot,
  type CalibrationSnapshotStatus,
} from "./entities/investor-calibration-snapshot.schema";
import {
  CALIBRATION_RECOMPUTE_DEDUPE_WINDOW_MS,
  CALIBRATION_RECOMPUTE_JOB,
  type CalibrationRecomputeJobPayload,
} from "./calibration-recompute.constants";

export interface CalibrationSnapshotResponse {
  investorId: string;
  status: CalibrationSnapshotStatus;
  summary: CalibrationSummary;
  computedAt: string | null;
  lastJobId: string | null;
  lastError: string | null;
  enqueuedAt: string | null;
}

export interface RecomputeCalibrationResponse {
  investorId: string;
  jobId: string;
  status: "queued" | "in_progress";
  dedupedToExistingJob: boolean;
}

/**
 * DS-E11-F4-S1 — owns the persisted side of the calibration loop:
 *   - read latest snapshot for the admin UI
 *   - enqueue a recompute job (deduped per-investor within a 10s window)
 *   - run the actual aggregation, upsert the snapshot row
 *
 * The pure summarizer (`summarizeCalibrationRows`) stays in
 * `calibration.service.ts`. This service composes I/O around it.
 */
@Injectable()
export class CalibrationRecomputeService {
  private readonly logger = new Logger(CalibrationRecomputeService.name);

  constructor(
    private readonly drizzle: DrizzleService,
    private readonly queue: QueueService,
    private readonly lensDelta: LensDeltaService,
  ) {}

  /**
   * Returns the persisted snapshot for `investorId`. On first read with no
   * snapshot row, runs the aggregation inline so the UI always has data —
   * subsequent reads come from the cache.
   */
  async getSnapshot(investorId: string): Promise<CalibrationSnapshotResponse> {
    await this.assertInvestorExists(investorId);

    const [existing] = await this.drizzle.db
      .select()
      .from(investorCalibrationSnapshot)
      .where(eq(investorCalibrationSnapshot.investorId, investorId))
      .limit(1);

    if (existing) {
      return this.toResponse(existing, await this.cachedOrFreshSummary(existing, investorId));
    }

    // First read — compute once inline so the tab has something to render.
    const summary = await this.computeSummary(investorId);
    const row = await this.upsertSnapshot({
      investorId,
      summary,
      status: "completed",
      jobId: null,
      computedAt: new Date(),
      lastError: null,
    });

    return this.toResponse(row, summary);
  }

  /**
   * Enqueue a recompute job. Dedupes within `CALIBRATION_RECOMPUTE_DEDUPE_WINDOW_MS`
   * — if a queued/running job already exists for the investor OR one
   * completed inside the window, returns the existing job id.
   */
  async enqueueRecompute(investorId: string): Promise<RecomputeCalibrationResponse> {
    await this.assertInvestorExists(investorId);

    const now = new Date();
    const [existing] = await this.drizzle.db
      .select()
      .from(investorCalibrationSnapshot)
      .where(eq(investorCalibrationSnapshot.investorId, investorId))
      .limit(1);

    if (existing && existing.lastJobId) {
      const isInFlight =
        existing.status === "queued" || existing.status === "running";
      const enqueuedAt = existing.enqueuedAt ?? existing.updatedAt;
      const withinDedupeWindow =
        enqueuedAt &&
        now.getTime() - new Date(enqueuedAt).getTime() <
          CALIBRATION_RECOMPUTE_DEDUPE_WINDOW_MS;

      if (isInFlight || withinDedupeWindow) {
        this.logger.log(
          `Dedup recompute for investor ${investorId} → reusing job ${existing.lastJobId} (status=${existing.status})`,
        );
        return {
          investorId,
          jobId: existing.lastJobId,
          status: isInFlight ? "in_progress" : "queued",
          dedupedToExistingJob: true,
        };
      }
    }

    // BullMQ-level dedupe — passing the same jobId within the de-dupe
    // window returns the existing job instead of creating a new one. This
    // is a belt-and-braces guard if the snapshot row races (e.g. two
    // admins click at the exact same instant).
    const jobId = `calibration-recompute:${investorId}:${now.getTime()}`;

    const taskQueue = this.queue.getQueue(QUEUE_NAMES.TASK);
    if (!taskQueue) {
      throw new Error(`Queue ${QUEUE_NAMES.TASK} is not initialized`);
    }

    const payload: CalibrationRecomputeJobPayload = { investorId };
    const job = await taskQueue.add(
      CALIBRATION_RECOMPUTE_JOB,
      {
        type: "task" as const,
        userId: investorId,
        name: CALIBRATION_RECOMPUTE_JOB,
        payload: payload as unknown as Record<string, unknown>,
      },
      {
        jobId,
        attempts: 2,
        backoff: { type: "exponential", delay: 2_000 },
      },
    );

    const resolvedJobId = job.id ?? jobId;

    await this.upsertSnapshot({
      investorId,
      summary: this.snapshotSummary(existing),
      status: "queued",
      jobId: resolvedJobId,
      computedAt: existing?.computedAt ?? null,
      lastError: null,
      enqueuedAt: now,
    });

    this.logger.log(
      `Enqueued calibration recompute for investor ${investorId} → job ${resolvedJobId}`,
    );

    return {
      investorId,
      jobId: resolvedJobId,
      status: "queued",
      dedupedToExistingJob: false,
    };
  }

  /**
   * Job handler entry point — invoked by the calibration processor.
   * Marks the snapshot as `running`, recomputes, upserts as `completed`.
   * On failure the snapshot is flipped to `failed` with `lastError` set so
   * the previous good `summary` stays visible.
   */
  async runJob(
    investorId: string,
    jobId: string,
  ): Promise<{ summary: CalibrationSummary; computedAt: Date }> {
    await this.markRunning(investorId, jobId);

    try {
      const summary = await this.computeSummary(investorId);
      const computedAt = new Date();

      await this.upsertSnapshot({
        investorId,
        summary,
        status: "completed",
        jobId,
        computedAt,
        lastError: null,
      });

      return { summary, computedAt };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Calibration recompute failed for investor ${investorId} (job ${jobId}): ${message}`,
      );

      await this.markFailed(investorId, jobId, message);
      throw error;
    }
  }

  private async assertInvestorExists(investorId: string): Promise<void> {
    const [existing] = await this.drizzle.db
      .select({ id: user.id, role: user.role })
      .from(user)
      .where(eq(user.id, investorId))
      .limit(1);

    if (!existing) {
      throw new NotFoundException(`Investor ${investorId} not found`);
    }
    if (existing.role !== UserRole.INVESTOR) {
      throw new NotFoundException(
        `User ${investorId} is not an investor`,
      );
    }
  }

  private async computeSummary(investorId: string): Promise<CalibrationSummary> {
    // 1. Decision-based calibration aggregate (investor verdict vs
    //    model triage). Unchanged from #18.
    const rows = await this.drizzle.db
      .select({
        verdict: investorDealDecision.verdict,
        triage: investorDealDecision.triageClassificationAtDecision,
        reasonTags: investorDealDecision.reasonTags,
        startupId: investorDealDecision.startupId,
        decidedAt: investorDealDecision.decidedAt,
      })
      .from(investorDealDecision)
      .where(eq(investorDealDecision.investorId, investorId));

    const summary = summarizeCalibrationRows(rows);

    // 2. DS-E11-F2-S1 — DD-vs-screening lens deltas. Folded into the
    //    same summary so reads stay O(1) and the existing
    //    `investor.calibration.recompute.completed` WS event still
    //    triggers the UI refresh that surfaces them.
    const deltaRows = await this.lensDelta.getLatestDeltasForInvestor(
      investorId,
    );
    summary.lensDeltas = summarizeLensDeltas(deltaRows);

    return summary;
  }

  private async cachedOrFreshSummary(
    snapshot: { summary: Record<string, unknown> | null },
    investorId: string,
  ): Promise<CalibrationSummary> {
    if (snapshot.summary) {
      const cached = snapshot.summary as unknown as CalibrationSummary;
      // Back-compat: pre-DS-E11-F2-S1 snapshots predate the
      // `lensDeltas` field. Default it so consumers always see an
      // array (even an empty one) without a re-aggregation.
      return {
        ...cached,
        lensDeltas: Array.isArray(cached.lensDeltas) ? cached.lensDeltas : [],
      };
    }
    // Snapshot row exists but summary is null (e.g. failed first run).
    // Fall back to a live compute so the tab still renders.
    return this.computeSummary(investorId);
  }

  private snapshotSummary(
    existing: { summary: Record<string, unknown> | null } | undefined,
  ): CalibrationSummary {
    if (existing?.summary) {
      return existing.summary as unknown as CalibrationSummary;
    }
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

  private async upsertSnapshot(input: {
    investorId: string;
    summary: CalibrationSummary;
    status: CalibrationSnapshotStatus;
    jobId: string | null;
    computedAt: Date | null;
    lastError: string | null;
    enqueuedAt?: Date | null;
  }): Promise<{
    investorId: string;
    summary: Record<string, unknown> | null;
    status: CalibrationSnapshotStatus;
    lastJobId: string | null;
    lastError: string | null;
    computedAt: Date | null;
    enqueuedAt: Date | null;
  }> {
    const now = new Date();

    const [row] = await this.drizzle.db
      .insert(investorCalibrationSnapshot)
      .values({
        investorId: input.investorId,
        summary: input.summary as unknown as Record<string, unknown>,
        status: input.status,
        lastJobId: input.jobId,
        lastError: input.lastError,
        computedAt: input.computedAt,
        enqueuedAt: input.enqueuedAt ?? null,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: investorCalibrationSnapshot.investorId,
        set: {
          summary: input.summary as unknown as Record<string, unknown>,
          status: input.status,
          lastJobId: input.jobId,
          lastError: input.lastError,
          computedAt: input.computedAt,
          ...(input.enqueuedAt !== undefined
            ? { enqueuedAt: input.enqueuedAt }
            : {}),
          updatedAt: now,
        },
      })
      .returning();

    if (!row) {
      throw new Error(
        `Failed to upsert calibration snapshot for investor ${input.investorId}`,
      );
    }

    return row;
  }

  private async markRunning(investorId: string, jobId: string): Promise<void> {
    await this.drizzle.db
      .update(investorCalibrationSnapshot)
      .set({
        status: "running",
        lastJobId: jobId,
        updatedAt: new Date(),
      })
      .where(eq(investorCalibrationSnapshot.investorId, investorId));
  }

  private async markFailed(
    investorId: string,
    jobId: string,
    error: string,
  ): Promise<void> {
    await this.drizzle.db
      .update(investorCalibrationSnapshot)
      .set({
        status: "failed",
        lastJobId: jobId,
        lastError: error,
        updatedAt: new Date(),
      })
      .where(eq(investorCalibrationSnapshot.investorId, investorId));
  }

  private toResponse(
    row: {
      investorId: string;
      status: CalibrationSnapshotStatus;
      lastJobId: string | null;
      lastError: string | null;
      computedAt: Date | null;
      enqueuedAt: Date | null;
    },
    summary: CalibrationSummary,
  ): CalibrationSnapshotResponse {
    return {
      investorId: row.investorId,
      status: row.status,
      summary,
      computedAt: row.computedAt ? row.computedAt.toISOString() : null,
      lastJobId: row.lastJobId,
      lastError: row.lastError,
      enqueuedAt: row.enqueuedAt ? row.enqueuedAt.toISOString() : null,
    };
  }
}
