import { Injectable } from '@nestjs/common';
import { and, desc, eq, inArray, or, sql } from 'drizzle-orm';
import { DrizzleService } from '../../database';
import { startupMatch, type MatchStatus } from './entities/investor.schema';
import { startup, StartupStatus } from '../startup/entities/startup.schema';
import { screeningDecision } from '../ai/entities/screening-decision.schema';
import { investorDealDecision } from './entities/investor-deal-decision.schema';

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

    // In-flight DD: startups the investor owns that are post-advance and
    // not yet visible in the match list. Two cases:
    //   - status ANALYZING + screening verdict='advance': DD pipeline is
    //     running right now (eval/synthesis in flight).
    //   - status PENDING_REVIEW + investor recorded a verdict='advance'
    //     decision: DD pipeline finished, deal is awaiting admin approval
    //     before it gets matched against the investor base.
    // Both cases would otherwise leave the deal invisible to the partner
    // who clicked ADVANCE — it leaves Screening but doesn't yet appear in
    // the match list. Surfacing them here closes the sync loop.
    const inFlightRows = await this.drizzle.db
      .select({
        startupId: startup.id,
        startupName: startup.name,
        startupLogoUrl: startup.logoUrl,
        startupStage: startup.stage,
        startupIndustry: startup.industry,
        startupDescription: startup.description,
        startupStatus: startup.status,
        createdAt: startup.createdAt,
        verdict: screeningDecision.classification,
      })
      .from(startup)
      .innerJoin(
        screeningDecision,
        eq(screeningDecision.startupId, startup.id),
      )
      .leftJoin(
        investorDealDecision,
        and(
          eq(investorDealDecision.startupId, startup.id),
          eq(investorDealDecision.investorId, investorId),
          eq(investorDealDecision.verdict, 'advance'),
        ),
      )
      .where(
        and(
          eq(startup.userId, investorId),
          or(
            and(
              eq(startup.status, StartupStatus.ANALYZING),
              eq(screeningDecision.classification, 'advance'),
            ),
            and(
              eq(startup.status, StartupStatus.PENDING_REVIEW),
              sql`${investorDealDecision.id} is not null`,
            ),
          ),
        ),
      )
      .orderBy(desc(startup.createdAt));

    // Dedup against startups already represented in matches (synthesis done).
    const matchedIds = new Set(matches.map((m) => m.startupId));
    const inFlight = inFlightRows
      .filter((r) => !matchedIds.has(r.startupId))
      // Same startup may have many screening rows — dedup by startupId, keep first.
      .filter((row, idx, arr) =>
        arr.findIndex((r) => r.startupId === row.startupId) === idx,
      );

    return {
      ...byStatus,
      inFlight,
      stats: {
        total: matches.length + inFlight.length,
        byStatus: Object.fromEntries(
          statuses.map((s) => [s, byStatus[s].length]),
        ) as Record<MatchStatus, number>,
        inFlight: inFlight.length,
      },
    };
  }
}
