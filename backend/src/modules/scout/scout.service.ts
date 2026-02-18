import {
  Injectable,
  Logger,
  ConflictException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { eq, and, sql, desc } from 'drizzle-orm';
import { DrizzleService } from '../../database';
import { NotificationService } from '../../notification/notification.service';
import { NotificationType } from '../../notification/entities';
import {
  scoutApplication,
  ScoutApplicationStatus,
  ScoutApplication,
} from './entities/scout.schema';
import { user as userTable, UserRole } from '../../auth/entities/auth.schema';
import type { ApplyScout, RejectScout, GetApplicationsQuery } from './dto';

export type PaginatedApplications = {
  data: ScoutApplication[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

export type ScoutInvestorOption = {
  id: string;
  name: string;
  email: string;
  image: string | null;
  hasApplied: boolean;
  applicationStatus: ScoutApplicationStatus | null;
};

@Injectable()
export class ScoutService {
  private readonly logger = new Logger(ScoutService.name);

  constructor(
    private drizzle: DrizzleService,
    private notification: NotificationService,
  ) {}

  async apply(userId: string, dto: ApplyScout): Promise<ScoutApplication> {
    const [existing] = await this.drizzle.db
      .select()
      .from(scoutApplication)
      .where(
        and(
          eq(scoutApplication.userId, userId),
          eq(scoutApplication.investorId, dto.investorId),
        ),
      )
      .limit(1);

    if (existing) {
      throw new ConflictException(
        'You have already applied to be a scout for this investor',
      );
    }

    const [application] = await this.drizzle.db
      .insert(scoutApplication)
      .values({
        userId,
        investorId: dto.investorId,
        name: dto.name,
        email: dto.email,
        linkedinUrl: dto.linkedinUrl,
        experience: dto.experience,
        motivation: dto.motivation,
        dealflowSources: dto.dealflowSources,
        portfolio: dto.portfolio ?? [],
        status: ScoutApplicationStatus.PENDING,
      })
      .returning();

    await this.notification.create(
      dto.investorId,
      'New Scout Application',
      'You have a new scout application to review',
      NotificationType.INFO,
      `/investor/scout-applications/${application.id}`,
    );

    this.logger.log(
      `User ${userId} applied to be scout for investor ${dto.investorId}`,
    );
    return application;
  }

  async listInvestors(userId: string): Promise<ScoutInvestorOption[]> {
    const [investors, applications] = await Promise.all([
      this.drizzle.db
        .select({
          id: userTable.id,
          name: userTable.name,
          email: userTable.email,
          image: userTable.image,
        })
        .from(userTable)
        .where(eq(userTable.role, UserRole.INVESTOR))
        .orderBy(userTable.name),
      this.drizzle.db
        .select({
          investorId: scoutApplication.investorId,
          status: scoutApplication.status,
        })
        .from(scoutApplication)
        .where(eq(scoutApplication.userId, userId)),
    ]);

    const applicationsByInvestorId = new Map(
      applications.map((app) => [app.investorId, app.status]),
    );

    return investors.map((investor) => ({
      ...investor,
      hasApplied: applicationsByInvestorId.has(investor.id),
      applicationStatus: applicationsByInvestorId.get(investor.id) ?? null,
    }));
  }

  async findApplications(
    userId: string,
    query: GetApplicationsQuery,
  ): Promise<PaginatedApplications> {
    const { page, limit, status } = query;
    const offset = (page - 1) * limit;

    const conditions = [eq(scoutApplication.userId, userId)];

    if (status) {
      conditions.push(eq(scoutApplication.status, status));
    }

    const whereClause = and(...conditions);

    const [items, [{ count }]] = await Promise.all([
      this.drizzle.db
        .select()
        .from(scoutApplication)
        .where(whereClause)
        .orderBy(desc(scoutApplication.createdAt))
        .limit(limit)
        .offset(offset),
      this.drizzle.db
        .select({ count: sql<number>`count(*)::int` })
        .from(scoutApplication)
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

  async findApplicationsForInvestor(
    investorId: string,
    query: GetApplicationsQuery,
  ): Promise<PaginatedApplications> {
    const { page, limit, status } = query;
    const offset = (page - 1) * limit;

    const conditions = [eq(scoutApplication.investorId, investorId)];

    if (status) {
      conditions.push(eq(scoutApplication.status, status));
    }

    const whereClause = and(...conditions);

    const [items, [{ count }]] = await Promise.all([
      this.drizzle.db
        .select()
        .from(scoutApplication)
        .where(whereClause)
        .orderBy(desc(scoutApplication.createdAt))
        .limit(limit)
        .offset(offset),
      this.drizzle.db
        .select({ count: sql<number>`count(*)::int` })
        .from(scoutApplication)
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

  async approve(
    applicationId: string,
    investorId: string,
  ): Promise<ScoutApplication> {
    const [application] = await this.drizzle.db
      .select()
      .from(scoutApplication)
      .where(eq(scoutApplication.id, applicationId))
      .limit(1);

    if (!application) {
      throw new NotFoundException('Scout application not found');
    }

    if (application.investorId !== investorId) {
      throw new ForbiddenException(
        'You can only approve applications to yourself',
      );
    }

    if (application.status !== ScoutApplicationStatus.PENDING) {
      throw new ConflictException('Application has already been reviewed');
    }

    const [updated] = await this.drizzle.db
      .update(scoutApplication)
      .set({
        status: ScoutApplicationStatus.APPROVED,
        reviewedAt: new Date(),
        reviewedBy: investorId,
      })
      .where(eq(scoutApplication.id, applicationId))
      .returning();

    // Update user role to scout
    await this.drizzle.db
      .update(userTable)
      .set({ role: UserRole.SCOUT })
      .where(eq(userTable.id, application.userId));

    await this.notification.create(
      application.userId,
      'Scout Application Approved',
      'Your scout application has been approved',
      NotificationType.SUCCESS,
      '/scout/applications',
    );

    this.logger.log(`Scout application ${applicationId} approved`);
    return updated;
  }

  async reject(
    applicationId: string,
    investorId: string,
    dto: RejectScout,
  ): Promise<ScoutApplication> {
    const [application] = await this.drizzle.db
      .select()
      .from(scoutApplication)
      .where(eq(scoutApplication.id, applicationId))
      .limit(1);

    if (!application) {
      throw new NotFoundException('Scout application not found');
    }

    if (application.investorId !== investorId) {
      throw new ForbiddenException(
        'You can only reject applications to yourself',
      );
    }

    if (application.status !== ScoutApplicationStatus.PENDING) {
      throw new ConflictException('Application has already been reviewed');
    }

    const [updated] = await this.drizzle.db
      .update(scoutApplication)
      .set({
        status: ScoutApplicationStatus.REJECTED,
        reviewedAt: new Date(),
        reviewedBy: investorId,
        rejectionReason: dto.rejectionReason,
      })
      .where(eq(scoutApplication.id, applicationId))
      .returning();

    await this.notification.create(
      application.userId,
      'Scout Application Rejected',
      `Your scout application has been rejected: ${dto.rejectionReason}`,
      NotificationType.WARNING,
      '/scout/applications',
    );

    this.logger.log(`Scout application ${applicationId} rejected`);
    return updated;
  }
}
