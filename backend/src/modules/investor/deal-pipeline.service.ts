import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DrizzleService } from '../../database';
import { startupMatch, type MatchStatus } from './entities/investor.schema';
import { startup } from '../startup/entities/startup.schema';

@Injectable()
export class DealPipelineService {
  constructor(private drizzle: DrizzleService) {}

  async getPipeline(investorId: string) {
    const matches = await this.drizzle.db
      .select({
        id: startupMatch.id,
        startupId: startupMatch.startupId,
        overallScore: startupMatch.overallScore,
        isSaved: startupMatch.isSaved,
        viewedAt: startupMatch.viewedAt,
        status: startupMatch.status,
        statusChangedAt: startupMatch.statusChangedAt,
        passReason: startupMatch.passReason,
        passNotes: startupMatch.passNotes,
        investmentAmount: startupMatch.investmentAmount,
        investmentCurrency: startupMatch.investmentCurrency,
        investmentDate: startupMatch.investmentDate,
        investmentNotes: startupMatch.investmentNotes,
        meetingRequested: startupMatch.meetingRequested,
        thesisFitScore: startupMatch.thesisFitScore,
        fitRationale: startupMatch.fitRationale,
        createdAt: startupMatch.createdAt,
        startupName: startup.name,
        startupLogoUrl: startup.logoUrl,
        startupStage: startup.stage,
        startupIndustry: startup.industry,
        startupDescription: startup.description,
      })
      .from(startupMatch)
      .leftJoin(startup, eq(startupMatch.startupId, startup.id))
      .where(eq(startupMatch.investorId, investorId));

    const statuses: MatchStatus[] = [
      'new',
      'reviewing',
      'engaged',
      'closed',
      'passed',
    ];
    const byStatus = Object.fromEntries(
      statuses.map((s) => [s, matches.filter((m) => m.status === s)]),
    ) as Record<MatchStatus, typeof matches>;

    return {
      ...byStatus,
      stats: {
        total: matches.length,
        byStatus: Object.fromEntries(
          statuses.map((s) => [s, byStatus[s].length]),
        ) as Record<MatchStatus, number>,
      },
    };
  }
}
