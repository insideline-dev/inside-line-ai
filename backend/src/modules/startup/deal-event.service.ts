import { Injectable, Logger } from "@nestjs/common";
import { desc, eq, inArray } from "drizzle-orm";
import { DrizzleService } from "../../database";
import { UserRole } from "../../auth/entities/auth.schema";
import {
  dealEvent,
  type DealEventRow,
  type DealEventType,
} from "./entities/deal-event.schema";
import { startupMatch } from "../investor/entities/investor.schema";
import { startup } from "./entities/startup.schema";

/**
 * DS-E8-F1-S1 — append-only event log for deal-level changes. The
 * service is deliberately tiny: record(...) and forStartup(...). All
 * the intelligence about what to record lives at the call sites.
 *
 * Failures NEVER throw — `record` swallows DB errors and logs them.
 * Reasoning: an event-log write should never break the underlying
 * action (a failed insert here shouldn't 500 a screening run, abort a
 * decision capture, etc.). We accept eventual loss of audit rows on
 * DB hiccups in exchange for not coupling business logic to logging.
 */
@Injectable()
export class DealEventService {
  private readonly logger = new Logger(DealEventService.name);

  constructor(private readonly drizzle: DrizzleService) {}

  async record(input: {
    startupId: string;
    actorUserId?: string | null;
    type: DealEventType;
    payload?: Record<string, unknown>;
  }): Promise<DealEventRow | null> {
    try {
      const [row] = await this.drizzle.db
        .insert(dealEvent)
        .values({
          startupId: input.startupId,
          actorUserId: input.actorUserId ?? null,
          type: input.type,
          payload: input.payload ?? {},
        })
        .returning();
      return row ?? null;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `record(${input.type}) failed for startup=${input.startupId}: ${msg}`,
      );
      return null;
    }
  }

  /**
   * Returns events for a startup, newest first. Caller decides limit;
   * default keeps the timeline UI fast on long-running deals.
   */
  async forStartup(
    startupId: string,
    options: { limit?: number; viewerRole?: UserRole } = {},
  ): Promise<DealEventRow[]> {
    const limit = Math.min(Math.max(options.limit ?? 200, 1), 500);
    const rows = await this.drizzle.db
      .select()
      .from(dealEvent)
      .where(eq(dealEvent.startupId, startupId))
      .orderBy(desc(dealEvent.occurredAt))
      .limit(limit);

    if (options.viewerRole !== UserRole.FOUNDER) {
      return rows;
    }

    return rows.filter((row) => row.type !== "decision.recorded");
  }

  async forInvestor(
    investorId: string,
    options: { limit?: number } = {},
  ): Promise<(DealEventRow & { startupName: string | null })[]> {
    const limit = Math.min(Math.max(options.limit ?? 100, 1), 500);

    const investorStartupIds = await this.drizzle.db
      .select({ startupId: startupMatch.startupId })
      .from(startupMatch)
      .where(eq(startupMatch.investorId, investorId));

    if (investorStartupIds.length === 0) return [];

    const ids = investorStartupIds.map((r) => r.startupId);

    const rows = await this.drizzle.db
      .select({
        id: dealEvent.id,
        startupId: dealEvent.startupId,
        actorUserId: dealEvent.actorUserId,
        type: dealEvent.type,
        payload: dealEvent.payload,
        occurredAt: dealEvent.occurredAt,
        startupName: startup.name,
      })
      .from(dealEvent)
      .innerJoin(startup, eq(startup.id, dealEvent.startupId))
      .where(inArray(dealEvent.startupId, ids))
      .orderBy(desc(dealEvent.occurredAt))
      .limit(limit);

    return rows.filter((row) => row.type !== "decision.recorded");
  }
}
