import {
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { eq, and, gte, desc, sql } from 'drizzle-orm';
import { DrizzleService } from '../../database';
import { QueueService, QUEUE_NAMES } from '../../queue';
import { startupMatch, NewStartupMatch } from './entities/investor.schema';
import { GetMatchesQuery } from './dto';
import { ScoringService } from './scoring.service';

@Injectable()
export class MatchService {
  private readonly logger = new Logger(MatchService.name);

  constructor(
    private drizzle: DrizzleService,
    private queue: QueueService,
    private scoringService: ScoringService,
  ) {}

  async findAll(investorId: string, query: GetMatchesQuery) {
    return this.drizzle.withRLS(investorId, async (db) => {
      const { page, limit, minScore, isSaved } = query;
      const offset = (page - 1) * limit;

      const conditions = [eq(startupMatch.investorId, investorId)];

      if (minScore !== undefined) {
        conditions.push(gte(startupMatch.overallScore, minScore));
      }
      if (isSaved !== undefined) {
        conditions.push(eq(startupMatch.isSaved, isSaved));
      }

      const whereClause = and(...conditions);

      const [items, [{ count }]] = await Promise.all([
        db
          .select()
          .from(startupMatch)
          .where(whereClause)
          .orderBy(desc(startupMatch.overallScore))
          .limit(limit)
          .offset(offset),
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(startupMatch)
          .where(whereClause),
      ]);

      return {
        data: items,
        meta: {
          total: count,
          page,
          limit,
          totalPages: Math.ceil(count / limit),
        },
      };
    });
  }

  async findOne(investorId: string, startupId: string) {
    return this.drizzle.withRLS(investorId, async (db) => {
      const [match] = await db
        .select()
        .from(startupMatch)
        .where(
          and(
            eq(startupMatch.investorId, investorId),
            eq(startupMatch.startupId, startupId),
          ),
        )
        .limit(1);

      if (!match) {
        throw new NotFoundException('Match not found');
      }

      return match;
    });
  }

  async toggleSaved(investorId: string, startupId: string) {
    return this.drizzle.withRLS(investorId, async (db) => {
      const match = await this.findOne(investorId, startupId);

      const [updated] = await db
        .update(startupMatch)
        .set({
          isSaved: !match.isSaved,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(startupMatch.investorId, investorId),
            eq(startupMatch.startupId, startupId),
          ),
        )
        .returning();

      this.logger.log(
        `Toggled saved status for match ${investorId}/${startupId}`,
      );
      return updated;
    });
  }

  async updateViewedAt(investorId: string, startupId: string) {
    return this.drizzle.withRLS(investorId, async (db) => {
      const [updated] = await db
        .update(startupMatch)
        .set({
          viewedAt: new Date(),
        })
        .where(
          and(
            eq(startupMatch.investorId, investorId),
            eq(startupMatch.startupId, startupId),
          ),
        )
        .returning();

      return updated;
    });
  }

  calculateOverallScore(match: {
    marketScore: number | null;
    teamScore: number | null;
    productScore: number | null;
    tractionScore: number | null;
    financialsScore: number | null;
  }, weights: {
    marketWeight: number;
    teamWeight: number;
    productWeight: number;
    tractionWeight: number;
    financialsWeight: number;
  }): number {
    const marketScore = match.marketScore ?? 0;
    const teamScore = match.teamScore ?? 0;
    const productScore = match.productScore ?? 0;
    const tractionScore = match.tractionScore ?? 0;
    const financialsScore = match.financialsScore ?? 0;

    return Math.round(
      (marketScore * weights.marketWeight +
        teamScore * weights.teamWeight +
        productScore * weights.productWeight +
        tractionScore * weights.tractionWeight +
        financialsScore * weights.financialsWeight) /
        100,
    );
  }

  async regenerateMatches(investorId: string) {
    await this.queue.addJob(
      QUEUE_NAMES.TASK,
      {
        type: 'task',
        userId: investorId,
        name: 'regenerate-matches',
        priority: 2,
        payload: { investorId },
      },
      { priority: 2 },
    );

    this.logger.log(`Queued match regeneration for investor ${investorId}`);
  }

  async createOrUpdate(
    investorId: string,
    startupId: string,
    scores: {
      marketScore?: number;
      teamScore?: number;
      productScore?: number;
      tractionScore?: number;
      financialsScore?: number;
      matchReason?: string;
    },
  ) {
    return this.drizzle.withRLS(investorId, async (db) => {
      const weights = await this.scoringService.findOne(investorId);
      const overallScore = this.calculateOverallScore(
        {
          marketScore: scores.marketScore ?? null,
          teamScore: scores.teamScore ?? null,
          productScore: scores.productScore ?? null,
          tractionScore: scores.tractionScore ?? null,
          financialsScore: scores.financialsScore ?? null,
        },
        weights,
      );

      const [existing] = await db
        .select()
        .from(startupMatch)
        .where(
          and(
            eq(startupMatch.investorId, investorId),
            eq(startupMatch.startupId, startupId),
          ),
        )
        .limit(1);

      if (existing) {
        const [updated] = await db
          .update(startupMatch)
          .set({
            ...scores,
            overallScore,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(startupMatch.investorId, investorId),
              eq(startupMatch.startupId, startupId),
            ),
          )
          .returning();

        this.logger.log(`Updated match ${investorId}/${startupId}`);
        return updated;
      }

      const [created] = await db
        .insert(startupMatch)
        .values({
          investorId,
          startupId,
          ...scores,
          overallScore,
        })
        .returning();

      this.logger.log(`Created match ${investorId}/${startupId}`);
      return created;
    });
  }
}
