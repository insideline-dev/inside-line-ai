import { Injectable, Logger } from '@nestjs/common';
import { sql, eq, gte, count, and, isNull } from 'drizzle-orm';
import { DrizzleService } from '../../database';
import { CacheService } from './cache.service';
import { user, UserRole } from '../../auth/entities/auth.schema';
import { startup, StartupStatus } from '../startup/entities/startup.schema';
import { startupMatch } from '../investor/entities/investor.schema';
import { portal, portalSubmission } from '../portal/entities/portal.schema';
import { investorThesis } from '../investor/entities/investor.schema';

const CACHE_TTL = 300; // 5 minutes

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
        this.drizzle.db.execute<{ date: string; count: string }>(sql`
          SELECT
            DATE(submitted_at) as date,
            COUNT(*) as count
          FROM startup
          WHERE submitted_at IS NOT NULL
            AND submitted_at >= ${cutoffDate}
          GROUP BY DATE(submitted_at)
          ORDER BY date DESC
        `),

        // Approval stats
        this.drizzle.db.execute<{
          total: string;
          approved: string;
          avg_hours: string | null;
        }>(sql`
          SELECT
            COUNT(*) FILTER (WHERE status IN ('approved', 'rejected')) as total,
            COUNT(*) FILTER (WHERE status = 'approved') as approved,
            AVG(EXTRACT(EPOCH FROM (approved_at - submitted_at)) / 3600)
              FILTER (WHERE status = 'approved') as avg_hours
          FROM startup
          WHERE submitted_at IS NOT NULL
        `),

        // Top rejection reasons
        this.drizzle.db.execute<{ reason: string; count: string }>(sql`
          SELECT
            rejection_reason as reason,
            COUNT(*) as count
          FROM startup
          WHERE rejection_reason IS NOT NULL
          GROUP BY rejection_reason
          ORDER BY count DESC
          LIMIT 10
        `),
      ]);

    const approvalArray = approvalStats as unknown as Array<{
      total: string;
      approved: string;
      avg_hours: string | null;
    }>;
    const approval = approvalArray[0];
    const total = Number(approval?.total ?? 0);
    const approved = Number(approval?.approved ?? 0);

    const submissionsArray = submissionsPerDay as unknown as Array<{
      date: string;
      count: string;
    }>;
    const rejectionArray = rejectionReasons as unknown as Array<{
      reason: string;
      count: string;
    }>;

    const stats: StartupStats = {
      submissionsPerDay: submissionsArray.map((r) => ({
        date: r.date,
        count: Number(r.count),
      })),
      approvalRate: total > 0 ? (approved / total) * 100 : 0,
      averageTimeToApproval: approval?.avg_hours
        ? Number(approval.avg_hours)
        : 0,
      topRejectionReasons: rejectionArray.map((r) => ({
        reason: r.reason,
        count: Number(r.count),
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
      this.drizzle.db.execute<{ range: string; count: string }>(sql`
        SELECT
          CASE
            WHEN overall_score >= 80 THEN '80-100'
            WHEN overall_score >= 60 THEN '60-79'
            WHEN overall_score >= 40 THEN '40-59'
            WHEN overall_score >= 20 THEN '20-39'
            ELSE '0-19'
          END as range,
          COUNT(*) as count
        FROM startup_match
        GROUP BY range
        ORDER BY range DESC
      `),

      // Most active investors
      this.drizzle.db.execute<{
        user_id: string;
        name: string;
        match_count: string;
      }>(sql`
        SELECT
          sm.investor_id as user_id,
          u.name,
          COUNT(*) as match_count
        FROM startup_match sm
        JOIN "user" u ON u.id = sm.investor_id
        GROUP BY sm.investor_id, u.name
        ORDER BY match_count DESC
        LIMIT 10
      `),
    ]);

    const distributionArray = matchDistribution as unknown as Array<{
      range: string;
      count: string;
    }>;
    const activeArray = mostActive as unknown as Array<{
      user_id: string;
      name: string;
      match_count: string;
    }>;

    const stats: InvestorStats = {
      activeInvestors: Number(activeInvestors[0]?.count ?? 0),
      matchDistribution: distributionArray.map((r) => ({
        range: r.range,
        count: Number(r.count),
      })),
      mostActiveInvestors: activeArray.map((r) => ({
        userId: r.user_id,
        name: r.name,
        matchCount: Number(r.match_count),
      })),
    };

    await this.cache.set(cacheKey, stats, CACHE_TTL);
    return stats;
  }

  private async getWeeklySignups(): Promise<
    Array<{ week: string; count: number }>
  > {
    const result = await this.drizzle.db.execute<{
      week: string;
      count: string;
    }>(sql`
      SELECT
        DATE_TRUNC('week', created_at)::date::text as week,
        COUNT(*) as count
      FROM "user"
      WHERE created_at >= NOW() - INTERVAL '8 weeks'
      GROUP BY week
      ORDER BY week DESC
    `);

    const resultArray = result as unknown as Array<{
      week: string;
      count: string;
    }>;

    return resultArray.map((r) => ({
      week: r.week,
      count: Number(r.count),
    }));
  }

  private async getTopIndustries(): Promise<
    Array<{ industry: string; count: number }>
  > {
    const result = await this.drizzle.db.execute<{
      industry: string;
      count: string;
    }>(sql`
      SELECT
        industry,
        COUNT(*) as count
      FROM startup
      WHERE status = 'approved'
      GROUP BY industry
      ORDER BY count DESC
      LIMIT 5
    `);

    const resultArray = result as unknown as Array<{
      industry: string;
      count: string;
    }>;

    return resultArray.map((r) => ({
      industry: r.industry,
      count: Number(r.count),
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
