import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { eq, desc, sql } from 'drizzle-orm';
import { DrizzleService } from '../../database';
import { user, UserRole } from '../../auth/entities/auth.schema';
import {
  investorProfile,
  investorThesis,
  startupMatch,
  investorScoringPreference,
} from '../investor/entities/investor.schema';
import { startup } from '../startup/entities/startup.schema';

@Injectable()
export class AdminInvestorService {
  private readonly logger = new Logger(AdminInvestorService.name);

  constructor(private drizzle: DrizzleService) {}

  async listInvestors() {
    const investors = await this.drizzle.db
      .select({
        userId: user.id,
        userName: user.name,
        userEmail: user.email,
        fundName: investorProfile.fundName,
        aum: investorProfile.aum,
        teamSize: investorProfile.teamSize,
        website: investorProfile.website,
        logoUrl: investorProfile.logoUrl,
        industries: investorThesis.industries,
        stages: investorThesis.stages,
        checkSizeMin: investorThesis.checkSizeMin,
        checkSizeMax: investorThesis.checkSizeMax,
        thesisSummary: investorThesis.thesisSummary,
        thesisSummaryGeneratedAt: investorThesis.thesisSummaryGeneratedAt,
        isActive: investorThesis.isActive,
        thesisCreatedAt: investorThesis.createdAt,
        matchCount: sql<number>`(
          SELECT COUNT(*)::int FROM startup_matches
          WHERE startup_matches.investor_id = ${user.id}
        )`,
        createdAt: user.createdAt,
      })
      .from(user)
      .leftJoin(investorProfile, eq(investorProfile.userId, user.id))
      .leftJoin(investorThesis, eq(investorThesis.userId, user.id))
      .where(eq(user.role, UserRole.INVESTOR))
      .orderBy(desc(user.createdAt));

    return investors.map((inv) => ({
      ...inv,
      hasThesis: inv.thesisCreatedAt !== null,
      industries: inv.industries ?? [],
      stages: inv.stages ?? [],
    }));
  }

  async getInvestorDetail(userId: string) {
    const [investorUser] = await this.drizzle.db
      .select({ id: user.id, name: user.name, email: user.email })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1);

    if (!investorUser) {
      throw new NotFoundException('Investor not found');
    }

    const [profile, thesis, matches, scoringPrefs] = await Promise.all([
      this.drizzle.db
        .select()
        .from(investorProfile)
        .where(eq(investorProfile.userId, userId))
        .limit(1)
        .then((rows) => rows[0] ?? null),

      this.drizzle.db
        .select()
        .from(investorThesis)
        .where(eq(investorThesis.userId, userId))
        .limit(1)
        .then((rows) => rows[0] ?? null),

      this.drizzle.db
        .select({
          id: startupMatch.id,
          startupId: startupMatch.startupId,
          startupName: startup.name,
          overallScore: startupMatch.overallScore,
          thesisFitScore: startupMatch.thesisFitScore,
          fitRationale: startupMatch.fitRationale,
          status: startupMatch.status,
          statusChangedAt: startupMatch.statusChangedAt,
          isSaved: startupMatch.isSaved,
          matchReason: startupMatch.matchReason,
          createdAt: startupMatch.createdAt,
        })
        .from(startupMatch)
        .innerJoin(startup, eq(startup.id, startupMatch.startupId))
        .where(eq(startupMatch.investorId, userId))
        .orderBy(desc(startupMatch.overallScore)),

      this.drizzle.db
        .select({
          stage: investorScoringPreference.stage,
          useCustomWeights: investorScoringPreference.useCustomWeights,
          customWeights: investorScoringPreference.customWeights,
        })
        .from(investorScoringPreference)
        .where(eq(investorScoringPreference.investorId, userId)),
    ]);

    return {
      user: investorUser,
      profile,
      thesis,
      matches,
      scoringPreferences: scoringPrefs,
    };
  }
}
