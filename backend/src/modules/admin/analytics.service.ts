import { Injectable, Logger } from '@nestjs/common';
import { sql, eq, gte, count, and, isNull, isNotNull, desc } from 'drizzle-orm';
import { z } from 'zod';
import { DrizzleService } from '../../database';
import { CacheService } from './cache.service';
import { user, UserRole } from '../../auth/entities/auth.schema';
import { startup, StartupStatus } from '../startup/entities/startup.schema';
import { startupMatch } from '../investor/entities/investor.schema';
import { portal, portalSubmission } from '../portal/entities/portal.schema';
import { investorThesis } from '../investor/entities/investor.schema';

const CACHE_TTL = 300; // 5 minutes

const approvalStatsSchema = z.object({
  total: z.string(),
  approved: z.string(),
  avg_hours: z.string().nullable(),
});

export interface PlatformStats {
  users: {
    total: number;
    byRole: Record<string, number>;
    weeklySignups: Array<{ week: string; count: number }>;
  };
  startups: {
    total: number;
    byStatus: Record<string, number>;
    pending: number;
  };
  matches: {
    total: number;
    highScore: number;
  };
  portals: {
    active: number;
    totalSubmissions: number;
  };
  topIndustries: Array<{ industry: string; count: number }>;
}

export interface StartupStats {
  submissionsPerDay: Array<{ date: string; count: number }>;
  approvalRate: number;
  averageTimeToApproval: number;
  topRejectionReasons: Array<{ reason: string; count: number }>;
}

export interface InvestorStats {
  activeInvestors: number;
  matchDistribution: Array<{ range: string; count: number }>;
  mostActiveInvestors: Array<{ userId: string; name: string; matchCount: number }>;
}

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(
    private drizzle: DrizzleService,
    private cache: CacheService,
  ) {}

  async getOverview(): Promise<PlatformStats> {
    const cacheKey = 'admin:stats:overview';
    const cached = await this.cache.get<PlatformStats>(cacheKey);
    if (cached) return cached;

    const [
      userStats,
      roleDistribution,
      weeklySignups,
      startupStats,
      statusDistribution,
      matchStats,
      highScoreMatches,
      portalStats,
      submissionCount,
      topIndustries,
    ] = await Promise.all([
      // Total users
      this.drizzle.db.select({ count: count() }).from(user),

      // Users by role
      this.drizzle.db
        .select({ role: user.role, count: count() })
        .from(user)
        .groupBy(user.role),

      // Weekly signups (last 8 weeks)
      this.getWeeklySignups(),

      // Total startups
      this.drizzle.db.select({ count: count() }).from(startup),

      // Startups by status
      this.drizzle.db
        .select({ status: startup.status, count: count() })
        .from(startup)
        .groupBy(startup.status),

      // Total matches
      this.drizzle.db.select({ count: count() }).from(startupMatch),

      // High score matches (>80)
      this.drizzle.db
        .select({ count: count() })
        .from(startupMatch)
        .where(gte(startupMatch.overallScore, 80)),

      // Active portals
      this.drizzle.db
        .select({ count: count() })
        .from(portal)
        .where(eq(portal.isActive, true)),

      // Total submissions
      this.drizzle.db.select({ count: count() }).from(portalSubmission),

      // Top industries
      this.getTopIndustries(),
    ]);

    const byRole: Record<string, number> = {};
    roleDistribution.forEach((r) => {
      byRole[r.role] = Number(r.count);
    });

    const byStatus: Record<string, number> = {};
    statusDistribution.forEach((s) => {
      byStatus[s.status] = Number(s.count);
    });

    const stats: PlatformStats = {
      users: {
        total: Number(userStats[0]?.count ?? 0),
        byRole,
        weeklySignups,
      },
      startups: {
        total: Number(startupStats[0]?.count ?? 0),
        byStatus,
        pending: byStatus[StartupStatus.SUBMITTED] ?? 0,
      },
      matches: {
        total: Number(matchStats[0]?.count ?? 0),
        highScore: Number(highScoreMatches[0]?.count ?? 0),
      },
      portals: {
        active: Number(portalStats[0]?.count ?? 0),
        totalSubmissions: Number(submissionCount[0]?.count ?? 0),
      },
      topIndustries,
    };

    await this.cache.set(cacheKey, stats, CACHE_TTL);
    return stats;
  }

  async getStartupStats(days = 30): Promise<StartupStats> {
    const cacheKey = `admin:stats:startups:${days}`;
    const cached = await this.cache.get<StartupStats>(cacheKey);
    if (cached) return cached;

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const [submissionsPerDay, approvalStats, rejectionReasons] =
      await Promise.all([
        // Submissions per day
        this.drizzle.db
          .select({
            date: sql<string>`DATE(${startup.submittedAt})`.as('date'),
            count: count(),
          })
          .from(startup)
          .where(
            and(
              isNotNull(startup.submittedAt),
              gte(startup.submittedAt, cutoffDate),
            ),
          )
          .groupBy(sql`DATE(${startup.submittedAt})`)
          .orderBy(desc(sql`DATE(${startup.submittedAt})`)),

        // Approval stats
        this.drizzle.db
          .select({
            total: sql<string>`COUNT(*) FILTER (WHERE ${startup.status} IN ('approved', 'rejected'))`,
            approved: sql<string>`COUNT(*) FILTER (WHERE ${startup.status} = 'approved')`,
            avg_hours: sql<string>`AVG(EXTRACT(EPOCH FROM (${startup.approvedAt} - ${startup.submittedAt})) / 3600) FILTER (WHERE ${startup.status} = 'approved')`,
          })
          .from(startup)
          .where(isNotNull(startup.submittedAt)),

        // Top rejection reasons
        this.drizzle.db
          .select({
            reason: startup.rejectionReason,
            count: count(),
          })
          .from(startup)
          .where(isNotNull(startup.rejectionReason))
          .groupBy(startup.rejectionReason)
          .orderBy(desc(count()))
          .limit(10),
      ]);

    const approvalArray = z.array(approvalStatsSchema).parse(approvalStats);
    const approval = approvalArray[0];
    const total = Number(approval?.total ?? 0);
    const approved = Number(approval?.approved ?? 0);

    const stats: StartupStats = {
      submissionsPerDay: submissionsPerDay.map((r) => ({
        date: r.date,
        count: r.count,
      })),
      approvalRate: total > 0 ? (approved / total) * 100 : 0,
      averageTimeToApproval: approval?.avg_hours
        ? Number(approval.avg_hours)
        : 0,
      topRejectionReasons: rejectionReasons.map((r) => ({
        reason: r.reason!,
        count: r.count,
      })),
    };

    await this.cache.set(cacheKey, stats, CACHE_TTL);
    return stats;
  }

  async getInvestorStats(): Promise<InvestorStats> {
    const cacheKey = 'admin:stats:investors';
    const cached = await this.cache.get<InvestorStats>(cacheKey);
    if (cached) return cached;

    const [activeInvestors, matchDistribution, mostActive] = await Promise.all([
      // Active investors (have thesis)
      this.drizzle.db
        .select({ count: count() })
        .from(investorThesis)
        .where(eq(investorThesis.isActive, true)),

      // Match distribution by score ranges
      this.drizzle.db
        .select({
          range: sql<string>`CASE
            WHEN ${startupMatch.overallScore} >= 80 THEN '80-100'
            WHEN ${startupMatch.overallScore} >= 60 THEN '60-79'
            WHEN ${startupMatch.overallScore} >= 40 THEN '40-59'
            WHEN ${startupMatch.overallScore} >= 20 THEN '20-39'
            ELSE '0-19'
          END`.as('range'),
          count: count(),
        })
        .from(startupMatch)
        .groupBy(sql`range`)
        .orderBy(desc(sql`range`)),

      // Most active investors
      this.drizzle.db
        .select({
          user_id: startupMatch.investorId,
          name: user.name,
          match_count: count(),
        })
        .from(startupMatch)
        .innerJoin(user, eq(user.id, startupMatch.investorId))
        .groupBy(startupMatch.investorId, user.name)
        .orderBy(desc(count()))
        .limit(10),
    ]);

    const stats: InvestorStats = {
      activeInvestors: Number(activeInvestors[0]?.count ?? 0),
      matchDistribution: matchDistribution.map((r) => ({
        range: r.range,
        count: r.count,
      })),
      mostActiveInvestors: mostActive.map((r) => ({
        userId: r.user_id,
        name: r.name,
        matchCount: r.match_count,
      })),
    };

    await this.cache.set(cacheKey, stats, CACHE_TTL);
    return stats;
  }

  private async getWeeklySignups(): Promise<
    Array<{ week: string; count: number }>
  > {
    const eightWeeksAgo = new Date();
    eightWeeksAgo.setDate(eightWeeksAgo.getDate() - 56);

    const result = await this.drizzle.db
      .select({
        week: sql<string>`DATE_TRUNC('week', ${user.createdAt})::date::text`.as('week'),
        count: count(),
      })
      .from(user)
      .where(gte(user.createdAt, eightWeeksAgo))
      .groupBy(sql`DATE_TRUNC('week', ${user.createdAt})::date::text`)
      .orderBy(desc(sql`DATE_TRUNC('week', ${user.createdAt})::date::text`));

    return result.map((r) => ({
      week: r.week,
      count: r.count,
    }));
  }

  private async getTopIndustries(): Promise<
    Array<{ industry: string; count: number }>
  > {
    const result = await this.drizzle.db
      .select({
        industry: startup.industry,
        count: count(),
      })
      .from(startup)
      .where(eq(startup.status, StartupStatus.APPROVED))
      .groupBy(startup.industry)
      .orderBy(desc(count()))
      .limit(5);

    return result.map((r) => ({
      industry: r.industry!,
      count: r.count,
    }));
  }

  async normalizeLocations(): Promise<{ message: string; startupsToNormalize: number }> {
    // Find count of startups where location exists but normalizedRegion is null
    // For now, just return the count (actual normalization can be async/future)
    const result = await this.drizzle.db
      .select({ count: count() })
      .from(startup)
      .where(
        and(
          // Check if location column exists and is not null
          sql`${startup.location} IS NOT NULL`,
          // Check if normalizedRegion is null
          isNull(startup.normalizedRegion),
        ),
      );

    const startupsToNormalize = Number(result[0]?.count ?? 0);

    this.logger.log(`Found ${startupsToNormalize} startups to normalize`);

    return {
      message: `Found ${startupsToNormalize} startups with location data to normalize`,
      startupsToNormalize,
    };
  }
}
