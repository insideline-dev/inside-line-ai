import {
  Injectable,
  Logger,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { eq, and, sql, desc } from 'drizzle-orm';
import { DrizzleService } from '../../database';
import { NotificationService } from '../../notification/notification.service';
import { NotificationType } from '../../notification/entities';
import {
  scoutApplication,
  scoutSubmission,
  ScoutApplicationStatus,
  ScoutSubmission,
} from './entities/scout.schema';
import { startup, StartupStatus } from '../startup/entities/startup.schema';
import type { SubmitStartup, GetSubmissionsQuery } from './dto';

export type PaginatedSubmissions = {
  data: ScoutSubmission[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

const DEFAULT_COMMISSION_RATE = 500; // 5% in basis points

@Injectable()
export class SubmissionService {
  private readonly logger = new Logger(SubmissionService.name);

  constructor(
    private drizzle: DrizzleService,
    private notification: NotificationService,
  ) {}

  private generateSlug(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  async submit(
    scoutId: string,
    dto: SubmitStartup,
  ): Promise<{ startup: typeof startup.$inferSelect; submission: ScoutSubmission }> {
    const [scoutApp] = await this.drizzle.db
      .select()
      .from(scoutApplication)
      .where(
        and(
          eq(scoutApplication.userId, scoutId),
          eq(scoutApplication.investorId, dto.investorId),
          eq(scoutApplication.status, ScoutApplicationStatus.APPROVED),
        ),
      )
      .limit(1);

    if (!scoutApp) {
      throw new ForbiddenException(
        'You are not an approved scout for this investor',
      );
    }

    return this.drizzle.db.transaction(async (tx) => {
      const slug = this.generateSlug(dto.startupData.name);

      const [createdStartup] = await tx
        .insert(startup)
        .values({
          userId: scoutId,
          slug,
          ...dto.startupData,
          status: StartupStatus.SUBMITTED,
          submittedAt: new Date(),
        })
        .returning();

      const [submission] = await tx
        .insert(scoutSubmission)
        .values({
          scoutId,
          startupId: createdStartup.id,
          investorId: dto.investorId,
          commissionRate: DEFAULT_COMMISSION_RATE,
          notes: dto.notes || null,
        })
        .returning();

      await this.notification.create(
        dto.investorId,
        'New Scout Referral',
        `Scout has submitted ${dto.startupData.name} for your review`,
        NotificationType.INFO,
        `/investor/submissions/${submission.id}`,
      );

      this.logger.log(
        `Scout ${scoutId} submitted startup ${createdStartup.id} to investor ${dto.investorId}`,
      );

      return { startup: createdStartup, submission };
    });
  }

  async findAll(
    scoutId: string,
    query: GetSubmissionsQuery,
  ): Promise<PaginatedSubmissions> {
    const { page, limit, investorId } = query;
    const offset = (page - 1) * limit;

    const conditions = [eq(scoutSubmission.scoutId, scoutId)];

    if (investorId) {
      conditions.push(eq(scoutSubmission.investorId, investorId));
    }

    const whereClause = and(...conditions);

    const [items, [{ count }]] = await Promise.all([
      this.drizzle.db
        .select()
        .from(scoutSubmission)
        .where(whereClause)
        .orderBy(desc(scoutSubmission.createdAt))
        .limit(limit)
        .offset(offset),
      this.drizzle.db
        .select({ count: sql<number>`count(*)::int` })
        .from(scoutSubmission)
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
  }

  async findAllForInvestor(
    investorId: string,
    query: GetSubmissionsQuery,
  ): Promise<PaginatedSubmissions> {
    const { page, limit } = query;
    const offset = (page - 1) * limit;

    const whereClause = eq(scoutSubmission.investorId, investorId);

    const [items, [{ count }]] = await Promise.all([
      this.drizzle.db
        .select()
        .from(scoutSubmission)
        .where(whereClause)
        .orderBy(desc(scoutSubmission.createdAt))
        .limit(limit)
        .offset(offset),
      this.drizzle.db
        .select({ count: sql<number>`count(*)::int` })
        .from(scoutSubmission)
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
  }
}
