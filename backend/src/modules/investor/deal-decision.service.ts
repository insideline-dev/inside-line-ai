import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { and, desc, eq } from "drizzle-orm";
import { DrizzleService } from "../../database";
import { startup } from "../startup/entities/startup.schema";
import { DealEventService } from "../startup/deal-event.service";
import { ScreeningTriageService } from "../ai/screening/triage";
import {
  investorDealDecision,
  type InvestorDealDecisionRow,
} from "./entities/investor-deal-decision.schema";
import type { RecordDealDecision } from "./dto/record-deal-decision.dto";
import { buildDecisionCalibrationSnapshot } from "./calibration.service";

/**
 * DS-E11-F1-S1 — the investor's actual close/pass verdict on a deal.
 * Generates the calibration data DS-E7-F3-S1's loop will later consume
 * to learn when the system's triage decision disagrees with the
 * investor's call. One service, two operations: record + read latest.
 *
 * No update / delete: decisions are append-only. An investor revisiting
 * a deal records a fresh row; the latest row wins for "current state"
 * displays and historical rows stay around for calibration replay.
 */
@Injectable()
export class DealDecisionService {
  private readonly logger = new Logger(DealDecisionService.name);

  constructor(
    private readonly drizzle: DrizzleService,
    private readonly dealEvents: DealEventService,
    private readonly screeningTriage: ScreeningTriageService,
  ) {}

  async record(
    investorId: string,
    startupId: string,
    input: RecordDealDecision,
  ): Promise<InvestorDealDecisionRow> {
    const [exists] = await this.drizzle.db
      .select({ id: startup.id })
      .from(startup)
      .where(eq(startup.id, startupId))
      .limit(1);

    if (!exists) {
      throw new NotFoundException(`Startup ${startupId} not found`);
    }

    const latestTriage = await this.screeningTriage.latestForStartup(startupId);
    const triageClassificationAtDecision = latestTriage?.classification ?? null;
    const calibration = buildDecisionCalibrationSnapshot({
      verdict: input.verdict,
      triageClassificationAtDecision,
      reasonTags: input.reasonTags,
    });

    const [row] = await this.drizzle.db
      .insert(investorDealDecision)
      .values({
        investorId,
        startupId,
        verdict: input.verdict,
        reasonTags: input.reasonTags ?? [],
        notes: input.notes ?? null,
        triageClassificationAtDecision,
      })
      .returning();

    if (!row) {
      throw new Error("DealDecisionService.record: insert returned no row");
    }

    this.logger.log(
      `Decision recorded investor=${investorId} startup=${startupId} verdict=${input.verdict} tags=${input.reasonTags?.join(",") ?? "-"}`,
    );

    // DS-E8-F1-S1 — audit event so the timeline shows the partner's call.
    void this.dealEvents.record({
      startupId,
      actorUserId: investorId,
      type: "decision.recorded",
      payload: {
        verdict: input.verdict,
        reasonTags: input.reasonTags ?? [],
        hasNotes: Boolean(input.notes && input.notes.trim().length > 0),
        triageClassificationAtDecision,
        calibration,
      },
    });

    return row;
  }

  /** Returns the most recent decision for (investor, startup), or null. */
  async latest(
    investorId: string,
    startupId: string,
  ): Promise<InvestorDealDecisionRow | null> {
    const [row] = await this.drizzle.db
      .select()
      .from(investorDealDecision)
      .where(
        and(
          eq(investorDealDecision.investorId, investorId),
          eq(investorDealDecision.startupId, startupId),
        ),
      )
      .orderBy(desc(investorDealDecision.decidedAt))
      .limit(1);
    return row ?? null;
  }
}
