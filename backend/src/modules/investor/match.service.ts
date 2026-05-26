import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  Optional,
} from '@nestjs/common';
import { eq, and, gte, desc, sql } from 'drizzle-orm';
import { DrizzleService } from '../../database';
import { startup, StartupStatus } from '../startup/entities/startup.schema';
import { StartupMatchingPipelineService } from '../ai/services/startup-matching-pipeline.service';
import { startupMatch, type MatchStatus } from './entities/investor.schema';
import { DealEventService } from '../startup/deal-event.service';
import { DealDecisionService } from './deal-decision.service';
import { GetMatchesQuery, UpdateMatchStatus } from './dto';

@Injectable()
export class MatchService {
  private readonly logger = new Logger(MatchService.name);

  constructor(
    private drizzle: DrizzleService,
    private startupMatchingPipeline: StartupMatchingPipelineService,
    @Optional() private dealEvents?: DealEventService,
    @Optional() private dealDecisions?: DealDecisionService,
  ) {}

  async findAll(investorId: string, query: GetMatchesQuery) {
    return this.drizzle.withRLS(investorId, async (db) => {
      const { page, limit, minScore, minThesisFitScore, isSaved } = query;
      const offset = (page - 1) * limit;

      const conditions = [eq(startupMatch.investorId, investorId)];

      if (minScore !== undefined) {
        conditions.push(gte(startupMatch.overallScore, minScore));
      }
      if (minThesisFitScore !== undefined) {
        conditions.push(sql`coalesce(${startupMatch.thesisFitScore}, 0) >= ${minThesisFitScore}`);
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

      const isBookmarked = match.status === "bookmarked";
      const updates: Record<string, unknown> = {
        updatedAt: new Date(),
        statusChangedAt: new Date(),
        isSaved: !isBookmarked,
      };

      if (isBookmarked) {
        const restore =
          (match.statusBeforeBookmark as MatchStatus | null) ?? "new";
        updates.status = restore;
        updates.statusBeforeBookmark = null;
      } else {
        updates.statusBeforeBookmark = match.status;
        updates.status = "bookmarked";
        updates.isSaved = true;
      }

      const [updated] = await db
        .update(startupMatch)
        .set(updates)
        .where(
          and(
            eq(startupMatch.investorId, investorId),
            eq(startupMatch.startupId, startupId),
          ),
        )
        .returning();

      this.logger.log(
        `Toggled bookmark for match ${investorId}/${startupId} → ${updated.status}`,
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

  async updateMatchStatus(
    investorId: string,
    matchId: string,
    dto: UpdateMatchStatus,
  ) {
    return this.drizzle.withRLS(investorId, async (db) => {
      const [match] = await db
        .select()
        .from(startupMatch)
        .where(eq(startupMatch.id, matchId))
        .limit(1);

      if (!match) {
        throw new NotFoundException('Match not found');
      }

      if (match.investorId !== investorId) {
        throw new ForbiddenException('Match does not belong to this investor');
      }

      const updates: Record<string, unknown> = {
        status: dto.status,
        statusChangedAt: new Date(),
        updatedAt: new Date(),
        isSaved: dto.status === "bookmarked",
      };

      if (dto.status === "bookmarked" && match.status !== "bookmarked") {
        updates.statusBeforeBookmark = match.status;
      } else if (dto.status !== "bookmarked") {
        updates.statusBeforeBookmark = null;
      }

      if (dto.status === 'passed') {
        updates.passReason = dto.passReason;
        updates.passNotes = dto.passNotes ?? null;
      }

      if (dto.status === 'closed') {
        updates.investmentAmount = dto.investmentAmount;
        updates.investmentCurrency = dto.investmentCurrency ?? 'USD';
        updates.investmentDate = dto.investmentDate
          ? new Date(dto.investmentDate)
          : null;
        updates.investmentNotes = dto.investmentNotes ?? null;
      }

      if (
        dto.meetingRequested !== undefined &&
        dto.meetingRequested !== match.meetingRequested
      ) {
        updates.meetingRequested = dto.meetingRequested;
        if (dto.meetingRequested) {
          updates.meetingRequestedAt = new Date();
        }
      }

      const [updated] = await db
        .update(startupMatch)
        .set(updates)
        .where(eq(startupMatch.id, matchId))
        .returning();

      this.logger.log(
        `Updated match ${matchId} status to ${dto.status}`,
      );

      // DS-E8-F1-S2 — emit a partner-visible timeline event when the
      // kanban stage actually changes. We skip identical-status saves
      // so a no-op PATCH doesn't pollute the timeline.
      if (this.dealEvents && match.status !== dto.status) {
        void this.dealEvents.record({
          startupId: match.startupId,
          actorUserId: investorId,
          type: "stage.changed",
          payload: {
            matchId,
            from: match.status,
            to: dto.status,
            ...(dto.status === "passed" && dto.passReason
              ? { passReason: dto.passReason }
              : {}),
          },
        });
      }

      // Record a calibration decision when the investor passes or closes.
      if (this.dealDecisions && match.status !== dto.status) {
        const verdict =
          dto.status === "passed" ? "pass" as const
          : dto.status === "closed" ? "advance" as const
          : null;
        if (verdict) {
          void this.dealDecisions
            .record(investorId, match.startupId, {
              verdict,
              reasonTags: dto.status === "passed" && dto.passReason
                ? [dto.passReason]
                : [],
            })
            .catch((err) => {
              this.logger.warn(
                `Calibration decision record failed for match ${matchId}: ${err instanceof Error ? err.message : err}`,
              );
            });
        }
      }

      return updated;
    });
  }

  async regenerateMatches(investorId: string) {
    const approvedStartups = await this.drizzle.db
      .select({ id: startup.id })
      .from(startup)
      .where(eq(startup.status, StartupStatus.APPROVED));

    let queued = 0;
    let failed = 0;

    await Promise.all(
      approvedStartups.map(async ({ id }) => {
        try {
          await this.startupMatchingPipeline.queueStartupMatching({
            startupId: id,
            requestedBy: investorId,
            triggerSource: 'thesis_update',
            requireApproved: true,
          });
          queued += 1;
          if (this.dealEvents) {
            void this.dealEvents.record({
              startupId: id,
              actorUserId: investorId,
              type: "thesis.regenerated",
              payload: { source: "auto" },
            });
          }
        } catch (error) {
          failed += 1;
          const message = error instanceof Error ? error.message : String(error);
          this.logger.warn(
            `Failed to queue match regeneration for startup ${id}: ${message}`,
          );
        }
      }),
    );

    this.logger.log(
      `Queued match regeneration for investor ${investorId}: ${queued}/${approvedStartups.length}`,
    );

    return {
      totalApprovedStartups: approvedStartups.length,
      queued,
      failed,
    };
  }
}
