import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { asc, eq, isNotNull } from "drizzle-orm";
import { DrizzleService } from "../../database";
import { startup } from "../startup/entities";
import { startupEvaluation } from "./entities";

@Injectable()
export class PercentileRankService {
  private readonly logger = new Logger(PercentileRankService.name);

  @Cron("0 * * * *")
  async recalculatePercentileRanks(): Promise<void> {
    const start = Date.now();

    const rows = await this.drizzle.db
      .select({ id: startup.id, overallScore: startup.overallScore })
      .from(startup)
      .where(isNotNull(startup.overallScore))
      .orderBy(asc(startup.overallScore));

    if (rows.length === 0) {
      return;
    }

    const total = rows.length;
    const updates = rows.map((row, index) => ({
      id: row.id,
      percentileRank: Number((((index + 1) / total) * 100).toFixed(1)),
    }));

    await this.drizzle.db.transaction(async (tx) => {
      for (const { id, percentileRank } of updates) {
        await tx
          .update(startup)
          .set({ percentileRank })
          .where(eq(startup.id, id));

        await tx
          .update(startupEvaluation)
          .set({ percentileRank })
          .where(eq(startupEvaluation.startupId, id));
      }
    });

    const duration = Date.now() - start;
    this.logger.log(
      `Recalculated percentile ranks for ${total} startups in ${duration}ms`,
    );
  }

  constructor(private readonly drizzle: DrizzleService) {}
}
