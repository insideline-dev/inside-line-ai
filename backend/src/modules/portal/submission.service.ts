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
import { QueueService, QUEUE_NAMES } from '../../queue';
import {
  portalSubmission,
  PortalSubmission,
  PortalSubmissionStatus,
  portal,
} from './entities';
import { startup, StartupStatus } from '../startup/entities/startup.schema';
import { deriveStartupGeography } from '../geography';
import {
  findCanonicalStartupDuplicate,
  normalizeScreeningIntakeCandidate,
} from '../startup/screening-intake-normalization';
import { SubmitToPortal, GetSubmissionsQuery } from './dto';
import { NotificationType } from '../../notification/entities';
import { PipelineService } from '../ai/services/pipeline.service';
import { AiConfigService } from '../ai/services/ai-config.service';
import { StartupMatchingPipelineService } from '../ai/services/startup-matching-pipeline.service';

@Injectable()
export class SubmissionService {
  private readonly logger = new Logger(SubmissionService.name);

  constructor(
    private drizzle: DrizzleService,
    private notification: NotificationService,
    private userAuth: UserAuthService,
    private queue: QueueService,
    private aiPipeline: PipelineService,
    private aiConfig: AiConfigService,
    private startupMatching: StartupMatchingPipelineService,
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

    const normalizedStartup = normalizeScreeningIntakeCandidate(dto);
    const duplicate = await findCanonicalStartupDuplicate(this.drizzle.db, {
      companyName: normalizedStartup.name,
      website: normalizedStartup.website || undefined,
    });
    const slug = this.generateSlug(normalizedStartup.name);
    const geography = deriveStartupGeography(normalizedStartup.location || dto.location);

    const result = await this.drizzle.db.transaction(async (tx) => {
      let startupId: string;
      let startupUserId = duplicate?.userId ?? foundUser.id;

      if (duplicate) {
        startupId = duplicate.id;
      } else {
        const [createdStartup] = await tx
          .insert(startup)
          .values({
            userId: foundUser.id,
            slug,
            name: normalizedStartup.name,
            tagline: normalizedStartup.tagline,
            description: normalizedStartup.description,
            website: normalizedStartup.website,
            location: normalizedStartup.location,
            normalizedRegion: geography.normalizedRegion,
            geoCountryCode: geography.countryCode,
            geoLevel1: geography.level1,
            geoLevel2: geography.level2,
            geoLevel3: geography.level3,
            geoPath: geography.path,
            industry: normalizedStartup.industry,
            stage: dto.stage,
            fundingTarget: dto.fundingTarget,
            teamSize: dto.teamSize,
            pitchDeckUrl: dto.pitchDeckUrl,
            demoUrl: dto.demoUrl,
            status: StartupStatus.ANALYZING,
            submittedAt: new Date(),
          })
          .returning();

        startupId = createdStartup.id;
        startupUserId = foundUser.id;
      }

      const [submission] = await tx
        .insert(portalSubmission)
        .values({
          portalId,
          startupId,
          status: PortalSubmissionStatus.PENDING,
        })
        .returning();

      await this.notification.create(
        portalData.userId,
        'New Portal Submission',
        duplicate
          ? `Existing startup linked from ${foundUser.email}: ${normalizedStartup.name}`
          : `New submission to "${portalData.name}": ${normalizedStartup.name}`,
        NotificationType.INFO,
        `/portals/${portalId}/submissions`,
      );

      return {
        submission,
        startupId,
        startupUserId,
        reusedDuplicate: Boolean(duplicate),
      };
    });

    if (!result.reusedDuplicate) {
      if (this.aiConfig.isPipelineEnabled()) {
        await this.aiPipeline.startPipeline(result.startupId, result.startupUserId);
      } else {
        await this.queue.addJob(
          QUEUE_NAMES.TASK,
          {
            type: 'task',
            userId: result.startupUserId,
            name: 'score-startup',
            priority: 1,
            payload: { startupId: result.startupId },
          },
          { priority: 1 },
        );
      }
    }

    this.logger.log(
      `Created submission ${result.submission.id} to portal ${portalId} from ${foundUser.email}${result.reusedDuplicate ? ' (linked existing startup)' : ' and started analysis'}`,
    );
    return result.submission;
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

      if (updated.startupId) {
        try {
          const queued = await this.startupMatching.queueStartupMatching({
            startupId: updated.startupId,
            requestedBy: userId,
            triggerSource: 'approval',
            requireApproved: false,
          });
          this.logger.log(
            `Queued startup matching for portal-approved ${updated.startupId} (analysisJobId=${queued.analysisJobId})`,
          );
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          this.logger.error(
            `Portal approval succeeded but matching queue failed for startup ${updated.startupId}: ${message}`,
          );
        }
      }

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
