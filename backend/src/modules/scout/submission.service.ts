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
import {
  findCanonicalStartupDuplicate,
  normalizeScreeningIntakeCandidate,
} from '../startup/screening-intake-normalization';
import { startupMatch } from '../investor/entities/investor.schema';
import { user, UserRole } from '../../auth/entities/auth.schema';
import { StartupService } from '../startup/startup.service';
import type { ScoutSubmitStartup, GetSubmissionsQuery } from './dto';

export type ScoutSubmissionListItem = {
  id: string;
  submissionId: string;
  investorId: string;
  investorName: string | null;
  investorEmail: string | null;
  commissionRate: number | null;
  notes: string | null;
  name: string;
  tagline: string;
  description: string;
  website: string;
  location: string;
  industry: string;
  stage: string;
  fundingTarget: number;
  teamSize: number;
  status: string;
  overallScore: number | null;
  roundCurrency: string | null;
  createdAt: Date;
  submittedAt: Date | null;
  updatedAt: Date;
};

export type PaginatedSubmissions = {
  data: ScoutSubmissionListItem[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

export type ScoutStartupMatchPreview = {
  investorId: string;
  investorName: string | null;
  overallScore: number | null;
  thesisFitScore: number | null;
  fitRationale: string | null;
  status: string | null;
  createdAt: Date | null;
};

const DEFAULT_COMMISSION_RATE = 500; // 5% in basis points

@Injectable()
export class SubmissionService {
  private readonly logger = new Logger(SubmissionService.name);

  constructor(
    private drizzle: DrizzleService,
    private notification: NotificationService,
    private startupService: StartupService,
  ) {}

  async submit(
    scoutId: string,
    dto: ScoutSubmitStartup,
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

    const normalizedStartup = normalizeScreeningIntakeCandidate(dto.startupData);
    const normalizedStartupData = {
      ...dto.startupData,
      name: normalizedStartup.name,
      tagline: normalizedStartup.tagline,
      description: normalizedStartup.description,
      website: normalizedStartup.website,
      location: normalizedStartup.location,
      industry: normalizedStartup.industry,
      teamMembers: dto.startupData.teamMembers?.map((member) => ({
        name: member.name.trim(),
        role: member.role.trim(),
        linkedinUrl: member.linkedinUrl?.trim(),
      })),
    };

    const duplicate = await findCanonicalStartupDuplicate(this.drizzle.db, {
      companyName: normalizedStartup.name,
      website: normalizedStartup.website || undefined,
    });

    let startupRecord: typeof startup.$inferSelect;
    let startupId: string;

    if (duplicate) {
      startupId = duplicate.id;
      startupRecord =
        duplicate.status === StartupStatus.DRAFT && duplicate.userId === scoutId
          ? await this.startupService.submit(duplicate.id, scoutId)
          : await this.startupService.adminFindOne(duplicate.id);
    } else {
      startupRecord = await this.startupService.create(
        scoutId,
        normalizedStartupData,
        UserRole.SCOUT,
        { scoutId },
      );
      startupId = startupRecord.id;
      startupRecord = await this.startupService.submit(startupId, scoutId);
    }

    const [submission] = await this.drizzle.db
      .insert(scoutSubmission)
      .values({
        scoutId,
        startupId,
        investorId: dto.investorId,
        commissionRate: DEFAULT_COMMISSION_RATE,
        notes: dto.notes || null,
      })
      .returning();

    await this.notification.create(
      dto.investorId,
      'New Scout Referral',
      `Scout has submitted ${normalizedStartup.name} for your review`,
      NotificationType.INFO,
      `/investor/submissions/${submission.id}`,
    );

    this.logger.log(
      `Scout ${scoutId} submitted startup ${startupId} to investor ${dto.investorId}${duplicate ? ' (linked existing startup)' : ''}`,
    );

    return { startup: startupRecord, submission };
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
        .select({
          id: startup.id,
          submissionId: scoutSubmission.id,
          investorId: scoutSubmission.investorId,
          investorName: user.name,
          investorEmail: user.email,
          commissionRate: scoutSubmission.commissionRate,
          notes: scoutSubmission.notes,
          name: startup.name,
          tagline: startup.tagline,
          description: startup.description,
          website: startup.website,
          location: startup.location,
          industry: startup.industry,
          stage: startup.stage,
          fundingTarget: startup.fundingTarget,
          teamSize: startup.teamSize,
          status: startup.status,
          overallScore: startup.overallScore,
          roundCurrency: startup.roundCurrency,
          createdAt: startup.createdAt,
          submittedAt: startup.submittedAt,
          updatedAt: startup.updatedAt,
        })
        .from(scoutSubmission)
        .innerJoin(startup, eq(startup.id, scoutSubmission.startupId))
        .leftJoin(user, eq(user.id, scoutSubmission.investorId))
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
        .select({
          id: startup.id,
          submissionId: scoutSubmission.id,
          investorId: scoutSubmission.investorId,
          investorName: user.name,
          investorEmail: user.email,
          commissionRate: scoutSubmission.commissionRate,
          notes: scoutSubmission.notes,
          name: startup.name,
          tagline: startup.tagline,
          description: startup.description,
          website: startup.website,
          location: startup.location,
          industry: startup.industry,
          stage: startup.stage,
          fundingTarget: startup.fundingTarget,
          teamSize: startup.teamSize,
          status: startup.status,
          overallScore: startup.overallScore,
          roundCurrency: startup.roundCurrency,
          createdAt: startup.createdAt,
          submittedAt: startup.submittedAt,
          updatedAt: startup.updatedAt,
        })
        .from(scoutSubmission)
        .innerJoin(startup, eq(startup.id, scoutSubmission.startupId))
        .leftJoin(user, eq(user.id, scoutSubmission.investorId))
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

  private async assertSubmissionAccess(scoutId: string, startupId: string) {
    const [submission] = await this.drizzle.db
      .select()
      .from(scoutSubmission)
      .where(
        and(
          eq(scoutSubmission.scoutId, scoutId),
          eq(scoutSubmission.startupId, startupId),
        ),
      )
      .limit(1);

    if (!submission) {
      throw new NotFoundException('Scout submission not found');
    }
  }

  async getStartupDetail(
    scoutId: string,
    startupId: string,
    isAdmin = false,
  ) {
    if (isAdmin) {
      return this.startupService.adminFindOne(startupId);
    }

    await this.assertSubmissionAccess(scoutId, startupId);
    return this.startupService.findOne(startupId, scoutId);
  }

  async getStartupMatches(
    scoutId: string,
    startupId: string,
    limit = 3,
    isAdmin = false,
  ): Promise<{ data: ScoutStartupMatchPreview[] }> {
    if (!isAdmin) {
      await this.assertSubmissionAccess(scoutId, startupId);
    }

    const matches = await this.drizzle.db
      .select({
        investorId: startupMatch.investorId,
        investorName: user.name,
        overallScore: startupMatch.overallScore,
        thesisFitScore: startupMatch.thesisFitScore,
        fitRationale: startupMatch.fitRationale,
        status: startupMatch.status,
        createdAt: startupMatch.createdAt,
      })
      .from(startupMatch)
      .leftJoin(user, eq(user.id, startupMatch.investorId))
      .where(eq(startupMatch.startupId, startupId))
      .orderBy(desc(startupMatch.overallScore))
      .limit(limit);

    return { data: matches };
  }
}
