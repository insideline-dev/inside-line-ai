import { Injectable } from '@nestjs/common';
import { desc, eq, sql } from 'drizzle-orm';
import { DrizzleService } from '../../database';
import { scoutSubmission } from './entities/scout.schema';
import { scoutCommission } from './entities/scout-commission.schema';
import { user } from '../../auth/entities/auth.schema';

@Injectable()
export class ScoutMetricsService {
  constructor(private drizzle: DrizzleService) {}

  async getMetrics(scoutId: string) {
    const submissions = await this.drizzle.db
      .select()
      .from(scoutSubmission)
      .where(eq(scoutSubmission.scoutId, scoutId));

    return {
      totalSubmissions: submissions.length,
    };
  }

  async getLeaderboard() {
    const submissionCounts = await this.drizzle.db
      .select({
        scoutId: scoutSubmission.scoutId,
        scoutName: user.name,
        submissions: sql<number>`count(*)::int`,
      })
      .from(scoutSubmission)
      .leftJoin(user, eq(user.id, scoutSubmission.scoutId))
      .groupBy(scoutSubmission.scoutId, user.name)
      .orderBy(desc(sql`count(*)`));

    const commissionTotals = await this.drizzle.db
      .select({
        scoutId: scoutCommission.scoutId,
        earnings: sql<number>`coalesce(sum(${scoutCommission.commissionAmount}), 0)::int`,
      })
      .from(scoutCommission)
      .groupBy(scoutCommission.scoutId);

    const earningsByScout = new Map(
      commissionTotals.map((row) => [row.scoutId, row.earnings]),
    );

    return submissionCounts.map((row, index) => ({
      id: row.scoutId,
      name: row.scoutName ?? `Scout ${index + 1}`,
      submissions: row.submissions,
      conversions: 0,
      earnings: earningsByScout.get(row.scoutId) ?? 0,
    }));
  }
}
