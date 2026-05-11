import { createHash, randomUUID } from "node:crypto";
import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { DrizzleService } from "../../database";
import { NotificationGateway } from "../../notification/notification.gateway";
import { user, UserRole } from "../../auth/entities/auth.schema";
import {
  investorEvent,
  type InvestorEventRow,
  type InvestorEventType,
} from "./entities/investor-event.schema";
import type {
  CalibrationLensDelta,
  CalibrationReasonCount,
  CalibrationSummary,
} from "./calibration.service";
import {
  CALIBRATION_PROPOSAL_CREATED_EVENT,
  LENS_DELTA_DRIFT_THRESHOLD,
  LENS_DELTA_MIN_COUNT,
  OVERRIDE_COUNT_THRESHOLD,
  PROPOSAL_DEDUPE_WINDOW_MS,
} from "./calibration-proposal.constants";

/**
 * The investor-visible status of a proposal. Stored on the
 * `calibration_proposal_created` event's payload and overlaid by any
 * later `*_approved` / `*_rejected` event on the same proposalId.
 */
export type CalibrationProposalStatus = "pending" | "approved" | "rejected";

/**
 * Encoded suggested adjustment. v1 captures the per-lens score
 * adjustment as a signed integer (the negative of the screening delta —
 * if DD consistently scored higher than screening, screening's weight
 * should nudge up) and the override reason tags whose frequency
 * triggered the proposal. Storage-only — actually applying the delta to
 * the live thesis is OUT OF SCOPE for this story.
 */
export interface SuggestedCalibrationDelta {
  lensAdjustments: Array<{
    lensKey: "team" | "market" | "traction";
    /** Suggested signed nudge — sign convention: positive = increase weight. */
    adjustment: number;
  }>;
  overrideTagFocus: string[];
}

export interface CalibrationProposalEvidence {
  topOverrideReasons: CalibrationReasonCount[];
  lensDeltaSummary: CalibrationLensDelta[];
}

export interface CalibrationProposal {
  id: string;
  investorUserId: string;
  status: CalibrationProposalStatus;
  createdAt: string;
  /** ISO timestamp of the latest approve/reject event, or null when pending. */
  decidedAt: string | null;
  suggestedDelta: SuggestedCalibrationDelta;
  evidence: CalibrationProposalEvidence;
  rejectionReason: string | null;
  idempotencyKey: string;
  snapshotHash: string;
}

interface CalibrationProposalCreatedPayload {
  proposalId: string;
  idempotencyKey: string;
  snapshotHash: string;
  status: "pending";
  suggestedDelta: SuggestedCalibrationDelta;
  evidence: CalibrationProposalEvidence;
}

interface CalibrationProposalDecisionPayload {
  proposalId: string;
  reason?: string;
}

/**
 * Compute a stable snapshot hash from the inputs that drove the
 * proposal. Includes the override-reason fingerprint and the per-lens
 * mean deltas so a re-run with the same calibration evidence produces
 * the same key (idempotency).
 */
function computeSnapshotHash(summary: CalibrationSummary): string {
  const reasons = [...summary.topOverrideReasons]
    .sort((a, b) => a.reasonTag.localeCompare(b.reasonTag))
    .map((r) => `${r.reasonTag}:${r.count}`)
    .join("|");
  const deltas = [...summary.lensDeltas]
    .sort((a, b) => a.lensKey.localeCompare(b.lensKey))
    .map((d) => `${d.lensKey}:${d.meanDelta}:${d.count}`)
    .join("|");
  return createHash("sha256").update(`${reasons}::${deltas}`).digest("hex");
}

/**
 * Hash of (investorUserId, suggestedDelta, snapshotHash). Re-running the
 * job with the same evidence yields the same key, which the dedupe
 * window keys off.
 */
function computeIdempotencyKey(
  investorUserId: string,
  suggestedDelta: SuggestedCalibrationDelta,
  snapshotHash: string,
): string {
  const canonical = JSON.stringify({
    investorUserId,
    delta: {
      lensAdjustments: [...suggestedDelta.lensAdjustments].sort((a, b) =>
        a.lensKey.localeCompare(b.lensKey),
      ),
      overrideTagFocus: [...suggestedDelta.overrideTagFocus].sort(),
    },
    snapshotHash,
  });
  return createHash("sha256").update(canonical).digest("hex");
}

/**
 * Derive the suggested adjustments from the latest calibration summary.
 *
 * Heuristic (intentionally simple — see `calibration-proposal.constants.ts`):
 *
 *   1. **Override-tag focus** — any override reason that has at least
 *      `OVERRIDE_COUNT_THRESHOLD` occurrences in `topOverrideReasons` is
 *      surfaced as a tag the investor's calibration should pay more
 *      attention to. The follow-up story can interpret these as weight
 *      nudges (e.g. "team override 3× → bump team weight 5pp").
 *
 *   2. **Lens-delta drift** — any lens with `count >= LENS_DELTA_MIN_COUNT`
 *      and `abs(meanDelta) >= LENS_DELTA_DRIFT_THRESHOLD` contributes a
 *      `lensAdjustments` entry. Sign convention: positive `adjustment`
 *      = increase that lens's weight, mirroring the sign of `meanDelta`
 *      (DD consistently higher than screening → screening is under-
 *      weighting this lens).
 *
 * Returns `null` when neither rule trips — that's the "no proposal
 * warranted" path the calibration recompute relies on.
 */
export function buildSuggestedDelta(
  summary: CalibrationSummary,
): SuggestedCalibrationDelta | null {
  const overrideTagFocus = summary.topOverrideReasons
    .filter((r) => r.count >= OVERRIDE_COUNT_THRESHOLD)
    .map((r) => r.reasonTag);

  const lensAdjustments: SuggestedCalibrationDelta["lensAdjustments"] = [];
  for (const delta of summary.lensDeltas) {
    if (delta.count < LENS_DELTA_MIN_COUNT) continue;
    if (Math.abs(delta.meanDelta) < LENS_DELTA_DRIFT_THRESHOLD) continue;
    // Snap to the nearest integer so the encoded suggestion stays
    // discrete — UI shows whole-point nudges, not fractional drift.
    lensAdjustments.push({
      lensKey: delta.lensKey,
      adjustment: Math.round(delta.meanDelta),
    });
  }

  if (overrideTagFocus.length === 0 && lensAdjustments.length === 0) {
    return null;
  }

  return { lensAdjustments, overrideTagFocus };
}

/**
 * DS-E11-F3-S1 — owns the calibration proposal lifecycle.
 *
 *   - `maybeGenerateProposal` runs inside `CalibrationRecomputeService.runJob`
 *     after the snapshot is persisted (strict ordering: summary → lens deltas
 *     → snapshot → proposals). Reads the latest summary, runs the heuristic,
 *     emits a `calibration_proposal_created` event, fires the WS notice.
 *     Idempotent within the 7-day dedupe window.
 *
 *   - `listForInvestor` walks the investor's event rows and folds
 *     approval/rejection events on top of `_created` events to produce
 *     the current proposal view. v1 doesn't paginate — investor caps
 *     are tens of proposals over a quarter, so the small N is fine.
 *
 *   - `approve` / `reject` validate ownership, look up the proposal,
 *     append the decision event, and notify the recompute pipeline.
 *
 * Out of scope for this story (flagged here so the next iteration
 * has a clear seam to hook into):
 *   - Auto-applying the approved suggestedDelta to the live thesis row.
 *   - Multi-partner consensus (single investor per proposal in v1).
 */
@Injectable()
export class CalibrationProposalService {
  private readonly logger = new Logger(CalibrationProposalService.name);

  constructor(
    private readonly drizzle: DrizzleService,
    private readonly notifications: NotificationGateway,
  ) {}

  /**
   * Heuristic entry point — called from the recompute job after the
   * snapshot row is persisted. Skips silently when:
   *   - heuristics produce no actionable delta, OR
   *   - an event with the same idempotency key was emitted within the
   *     dedupe window.
   *
   * Returns the created proposal (when a fresh event was emitted) or
   * `null` (when skipped). Callers use the return value purely for
   * observability; the WS event is dispatched inside this method.
   */
  async maybeGenerateProposal(
    investorUserId: string,
    summary: CalibrationSummary,
  ): Promise<CalibrationProposal | null> {
    const suggestedDelta = buildSuggestedDelta(summary);
    if (!suggestedDelta) {
      return null;
    }

    const snapshotHash = computeSnapshotHash(summary);
    const idempotencyKey = computeIdempotencyKey(
      investorUserId,
      suggestedDelta,
      snapshotHash,
    );

    if (await this.hasRecentDuplicate(investorUserId, idempotencyKey)) {
      this.logger.debug(
        `Skipping duplicate proposal for investor=${investorUserId} key=${idempotencyKey.slice(0, 8)}`,
      );
      return null;
    }

    const proposalId = randomUUID();
    const evidence: CalibrationProposalEvidence = {
      topOverrideReasons: summary.topOverrideReasons,
      lensDeltaSummary: summary.lensDeltas,
    };
    const payload: CalibrationProposalCreatedPayload = {
      proposalId,
      idempotencyKey,
      snapshotHash,
      status: "pending",
      suggestedDelta,
      evidence,
    };

    const row = await this.insertEvent(
      investorUserId,
      "calibration_proposal_created",
      payload as unknown as Record<string, unknown>,
    );

    this.logger.log(
      `Calibration proposal created investor=${investorUserId} proposal=${proposalId}`,
    );

    this.notifications.sendInvestorEvent(
      investorUserId,
      CALIBRATION_PROPOSAL_CREATED_EVENT,
      {
        investorId: investorUserId,
        proposalId,
        createdAt: row.createdAt.toISOString(),
      },
    );

    return this.toProposal(row, payload, "pending", null, null);
  }

  async listForInvestor(
    investorUserId: string,
    status: CalibrationProposalStatus = "pending",
  ): Promise<CalibrationProposal[]> {
    const rows = await this.drizzle.db
      .select()
      .from(investorEvent)
      .where(eq(investorEvent.investorUserId, investorUserId))
      .orderBy(desc(investorEvent.createdAt));

    const proposals = this.foldEvents(rows);
    return proposals.filter((p) => p.status === status);
  }

  async approve(
    investorUserId: string,
    proposalId: string,
  ): Promise<CalibrationProposal> {
    const proposal = await this.findOwnedProposal(investorUserId, proposalId);
    if (proposal.status !== "pending") {
      throw new NotFoundException(
        `Calibration proposal ${proposalId} is not pending`,
      );
    }

    const decisionPayload: CalibrationProposalDecisionPayload = { proposalId };
    const row = await this.insertEvent(
      investorUserId,
      "calibration_proposal_approved",
      decisionPayload as unknown as Record<string, unknown>,
    );

    this.logger.log(
      `Calibration proposal approved investor=${investorUserId} proposal=${proposalId}`,
    );

    return {
      ...proposal,
      status: "approved",
      decidedAt: row.createdAt.toISOString(),
    };
  }

  async reject(
    investorUserId: string,
    proposalId: string,
    reason?: string,
  ): Promise<CalibrationProposal> {
    const proposal = await this.findOwnedProposal(investorUserId, proposalId);
    if (proposal.status !== "pending") {
      throw new NotFoundException(
        `Calibration proposal ${proposalId} is not pending`,
      );
    }

    const decisionPayload: CalibrationProposalDecisionPayload = {
      proposalId,
      ...(reason ? { reason } : {}),
    };
    const row = await this.insertEvent(
      investorUserId,
      "calibration_proposal_rejected",
      decisionPayload as unknown as Record<string, unknown>,
    );

    this.logger.log(
      `Calibration proposal rejected investor=${investorUserId} proposal=${proposalId}`,
    );

    return {
      ...proposal,
      status: "rejected",
      decidedAt: row.createdAt.toISOString(),
      rejectionReason: reason ?? null,
    };
  }

  /**
   * Confirms (a) the investor exists with the right role and (b) the
   * proposal exists and belongs to them. Returns the folded proposal so
   * approve/reject don't have to re-scan events themselves.
   */
  private async findOwnedProposal(
    investorUserId: string,
    proposalId: string,
  ): Promise<CalibrationProposal> {
    await this.assertInvestorExists(investorUserId);

    const rows = await this.drizzle.db
      .select()
      .from(investorEvent)
      .where(eq(investorEvent.investorUserId, investorUserId))
      .orderBy(desc(investorEvent.createdAt));

    const proposals = this.foldEvents(rows);
    const found = proposals.find((p) => p.id === proposalId);
    if (!found) {
      throw new NotFoundException(
        `Calibration proposal ${proposalId} not found for this investor`,
      );
    }
    return found;
  }

  private async assertInvestorExists(investorUserId: string): Promise<void> {
    const [existing] = await this.drizzle.db
      .select({ id: user.id, role: user.role })
      .from(user)
      .where(eq(user.id, investorUserId))
      .limit(1);

    if (!existing) {
      throw new NotFoundException(`Investor ${investorUserId} not found`);
    }
    if (existing.role !== UserRole.INVESTOR && existing.role !== UserRole.ADMIN) {
      throw new NotFoundException(
        `User ${investorUserId} cannot manage calibration proposals`,
      );
    }
  }

  private async hasRecentDuplicate(
    investorUserId: string,
    idempotencyKey: string,
  ): Promise<boolean> {
    const since = new Date(Date.now() - PROPOSAL_DEDUPE_WINDOW_MS);
    const [row] = await this.drizzle.db
      .select({ id: investorEvent.id })
      .from(investorEvent)
      .where(
        and(
          eq(investorEvent.investorUserId, investorUserId),
          eq(investorEvent.type, "calibration_proposal_created"),
          gte(investorEvent.createdAt, since),
          sql`${investorEvent.payload} ->> 'idempotencyKey' = ${idempotencyKey}`,
        ),
      )
      .limit(1);
    return Boolean(row);
  }

  private async insertEvent(
    investorUserId: string,
    type: InvestorEventType,
    payload: Record<string, unknown>,
  ): Promise<InvestorEventRow> {
    const [row] = await this.drizzle.db
      .insert(investorEvent)
      .values({
        investorUserId,
        type,
        payload,
      })
      .returning();
    if (!row) {
      throw new Error(
        `Failed to insert investor_event for ${investorUserId} (${type})`,
      );
    }
    return row;
  }

  /**
   * Fold an investor's event stream (newest-first) into the proposal
   * view. Approval / rejection events overlay the matching `_created`
   * event by proposalId.
   */
  private foldEvents(rows: InvestorEventRow[]): CalibrationProposal[] {
    interface DecisionEvent {
      type: "approved" | "rejected";
      createdAt: Date;
      reason: string | null;
    }
    const decisions = new Map<string, DecisionEvent>();
    const created: Array<{
      row: InvestorEventRow;
      payload: CalibrationProposalCreatedPayload;
    }> = [];

    for (const row of rows) {
      if (row.type === "calibration_proposal_approved") {
        const payload = row.payload as unknown as CalibrationProposalDecisionPayload;
        if (!payload?.proposalId) continue;
        if (!decisions.has(payload.proposalId)) {
          decisions.set(payload.proposalId, {
            type: "approved",
            createdAt: row.createdAt,
            reason: null,
          });
        }
      } else if (row.type === "calibration_proposal_rejected") {
        const payload = row.payload as unknown as CalibrationProposalDecisionPayload;
        if (!payload?.proposalId) continue;
        if (!decisions.has(payload.proposalId)) {
          decisions.set(payload.proposalId, {
            type: "rejected",
            createdAt: row.createdAt,
            reason: payload.reason ?? null,
          });
        }
      } else if (row.type === "calibration_proposal_created") {
        const payload = row.payload as unknown as CalibrationProposalCreatedPayload;
        if (!payload?.proposalId) continue;
        created.push({ row, payload });
      }
    }

    const proposals: CalibrationProposal[] = [];
    for (const { row, payload } of created) {
      const decision = decisions.get(payload.proposalId);
      const status: CalibrationProposalStatus = decision
        ? decision.type
        : "pending";
      proposals.push(
        this.toProposal(
          row,
          payload,
          status,
          decision?.createdAt ?? null,
          decision?.reason ?? null,
        ),
      );
    }

    // Newest-first by created-event timestamp.
    proposals.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return proposals;
  }

  private toProposal(
    row: InvestorEventRow,
    payload: CalibrationProposalCreatedPayload,
    status: CalibrationProposalStatus,
    decidedAt: Date | null,
    rejectionReason: string | null,
  ): CalibrationProposal {
    return {
      id: payload.proposalId,
      investorUserId: row.investorUserId,
      status,
      createdAt: row.createdAt.toISOString(),
      decidedAt: decidedAt ? decidedAt.toISOString() : null,
      suggestedDelta: payload.suggestedDelta,
      evidence: payload.evidence,
      rejectionReason,
      idempotencyKey: payload.idempotencyKey,
      snapshotHash: payload.snapshotHash,
    };
  }
}
