import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { eq, and, desc, sql } from 'drizzle-orm';
import { DrizzleService } from '../../database';
import { NotificationService } from '../../notification';
import { UserAuthService } from '../../auth/user-auth.service';
import {
  portalSubmission,
  PortalSubmission,
  PortalSubmissionStatus,
  portal,
} from './entities';
import { startup, StartupStatus } from '../startup/entities/startup.schema';
import { SubmitToPortal, GetSubmissionsQuery } from './dto';
import { NotificationType } from '../../notification/entities';

@Injectable()
export class SubmissionService {
  private readonly logger = new Logger(SubmissionService.name);

  constructor(
    private drizzle: DrizzleService,
    private notification: NotificationService,
    private userAuth: UserAuthService,
  ) {}

  private generateSlug(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  async create(
    portalId: string,
    dto: SubmitToPortal,
  ): Promise<PortalSubmission> {
    const [portalData] = await this.drizzle.db
      .select()
      .from(portal)
      .where(eq(portal.id, portalId))
      .limit(1);

    if (!portalData) {
      throw new NotFoundException(`Portal not found`);
    }

    if (!portalData.isActive) {
      throw new ForbiddenException('Portal is not accepting submissions');
    }

    let foundUser;
    if (dto.founderEmail) {
      foundUser = await this.userAuth.findUserByEmail(dto.founderEmail);
      if (!foundUser) {
        foundUser = await this.userAuth.createUser({
          email: dto.founderEmail,
          name: dto.founderName || dto.founderEmail.split('@')[0],
          emailVerified: false,
        });
        this.logger.log(`Created new user for founder ${dto.founderEmail}`);
      }
    } else {
      throw new ForbiddenException('Founder email is required');
    }

    const slug = this.generateSlug(dto.name);

    const result = await this.drizzle.db.transaction(async (tx) => {
      const [createdStartup] = await tx
        .insert(startup)
        .values({
          userId: foundUser.id,
          slug,
          name: dto.name,
          tagline: dto.tagline,
          description: dto.description,
          website: dto.website,
          location: dto.location,
          industry: dto.industry,
          stage: dto.stage,
          fundingTarget: dto.fundingTarget,
          teamSize: dto.teamSize,
          pitchDeckUrl: dto.pitchDeckUrl,
          demoUrl: dto.demoUrl,
          status: StartupStatus.SUBMITTED,
          submittedAt: new Date(),
        })
        .returning();

      const [submission] = await tx
        .insert(portalSubmission)
        .values({
          portalId,
          startupId: createdStartup.id,
          status: PortalSubmissionStatus.PENDING,
        })
        .returning();

      await this.notification.create(
        portalData.userId,
        'New Portal Submission',
        `New submission to "${portalData.name}": ${dto.name}`,
        NotificationType.INFO,
        `/portals/${portalId}/submissions`,
      );

      return submission;
    });

    this.logger.log(
      `Created submission ${result.id} to portal ${portalId} from ${foundUser.email}`,
    );
    return result;
  }

  async findAll(portalId: string, userId: string, query: GetSubmissionsQuery) {
    return this.drizzle.withRLS(userId, async (db) => {
      const [portalData] = await db
        .select()
        .from(portal)
        .where(and(eq(portal.id, portalId), eq(portal.userId, userId)))
        .limit(1);

      if (!portalData) {
        throw new NotFoundException(`Portal not found`);
      }

      const { page, limit, status } = query;
      const offset = (page - 1) * limit;

      const conditions = [eq(portalSubmission.portalId, portalId)];
      if (status) {
        conditions.push(eq(portalSubmission.status, status));
      }

      const whereClause = and(...conditions);

      const [items, [{ count }]] = await Promise.all([
        db
          .select({
            id: portalSubmission.id,
            portalId: portalSubmission.portalId,
            startupId: portalSubmission.startupId,
            status: portalSubmission.status,
            submittedAt: portalSubmission.submittedAt,
            startup: {
              id: startup.id,
              name: startup.name,
              tagline: startup.tagline,
              industry: startup.industry,
              stage: startup.stage,
              location: startup.location,
            },
          })
          .from(portalSubmission)
          .leftJoin(startup, eq(portalSubmission.startupId, startup.id))
          .where(whereClause)
          .orderBy(desc(portalSubmission.submittedAt))
          .limit(limit)
          .offset(offset),
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(portalSubmission)
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

  async approve(submissionId: string, userId: string): Promise<PortalSubmission> {
    return this.drizzle.withRLS(userId, async (db) => {
      const [submission] = await db
        .select({
          id: portalSubmission.id,
          portalId: portalSubmission.portalId,
          status: portalSubmission.status,
          portal: {
            userId: portal.userId,
          },
        })
        .from(portalSubmission)
        .leftJoin(portal, eq(portalSubmission.portalId, portal.id))
        .where(eq(portalSubmission.id, submissionId))
        .limit(1);

      if (!submission || !submission.portal) {
        throw new NotFoundException('Submission not found');
      }

      if (submission.portal.userId !== userId) {
        throw new ForbiddenException('You do not own this portal');
      }

      const [updated] = await db
        .update(portalSubmission)
        .set({ status: PortalSubmissionStatus.APPROVED })
        .where(eq(portalSubmission.id, submissionId))
        .returning();

      this.logger.log(`Approved submission ${submissionId}`);
      return updated;
    });
  }

  async reject(submissionId: string, userId: string): Promise<PortalSubmission> {
    return this.drizzle.withRLS(userId, async (db) => {
      const [submission] = await db
        .select({
          id: portalSubmission.id,
          portalId: portalSubmission.portalId,
          status: portalSubmission.status,
          portal: {
            userId: portal.userId,
          },
        })
        .from(portalSubmission)
        .leftJoin(portal, eq(portalSubmission.portalId, portal.id))
        .where(eq(portalSubmission.id, submissionId))
        .limit(1);

      if (!submission || !submission.portal) {
        throw new NotFoundException('Submission not found');
      }

      if (submission.portal.userId !== userId) {
        throw new ForbiddenException('You do not own this portal');
      }

      const [updated] = await db
        .update(portalSubmission)
        .set({ status: PortalSubmissionStatus.REJECTED })
        .where(eq(portalSubmission.id, submissionId))
        .returning();

      this.logger.log(`Rejected submission ${submissionId}`);
      return updated;
    });
  }
}
