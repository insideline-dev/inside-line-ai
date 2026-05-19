import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  HttpException,
  HttpStatus,
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
  portalSubmissionAudit,
  PortalSubmissionAuditOutcome,
  PortalLinkIntegrity,
} from './entities';
import {
  startup,
  StartupSourcePath,
  StartupStatus,
} from '../startup/entities/startup.schema';
import { deriveStartupGeography } from '../geography';
import {
  findCanonicalStartupDuplicate,
  normalizeScreeningCompanyNameForDuplicateMatching,
  normalizeScreeningIntakeCandidate,
} from '../startup/screening-intake-normalization';
import { SubmitToPortal, GetSubmissionsQuery } from './dto';
import { NotificationType } from '../../notification/entities';
import { PipelineService } from '../ai/services/pipeline.service';
import { AiConfigService } from '../ai/services/ai-config.service';
import { StartupMatchingPipelineService } from '../ai/services/startup-matching-pipeline.service';
import { SubmissionRateLimitService } from './submission-rate-limit.service';
import { hashFounderEmail } from './utils/submission-canonical';

export interface PublicSubmissionContext {
  /**
   * Client IP harvested from `@Ip()` / `X-Forwarded-For`. `null` when called
   * from a context with no HTTP request (e.g. Clara, admin import, tests).
   */
  ipAddress: string | null;
}

export interface PublicSubmissionResult {
  outcome: PortalSubmissionAuditOutcome;
  submission: PortalSubmission | null;
  /** Audit row id so admins / future client can cross-reference. */
  auditId: string | null;
  /** Human-readable explanation for blocked outcomes. */
  message?: string;
}

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
    private rateLimit: SubmissionRateLimitService,
  ) {}

  private generateSlug(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  /**
   * Public-portal submission entry point. Order of operations:
   *
   *   1. Resolve the portal row (404 if missing, 403 if disabled).
   *   2. Run abuse-prevention checks (per-IP burst, per-email rate limit,
   *      canonical-name dedupe window). Each check writes an audit row.
   *   3. On allow: create startup + portal submission, fire the AI pipeline,
   *      record an `accepted` audit row.
   *
   * Returns a `PublicSubmissionResult` so the controller / future clients can
   * see the outcome enum even on the happy path (useful for admin debugging
   * and Orval-generated typings).
   */
  async create(
    portalId: string,
    dto: SubmitToPortal,
    context: PublicSubmissionContext = { ipAddress: null },
  ): Promise<PublicSubmissionResult> {
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

    if (!dto.founderEmail) {
      throw new ForbiddenException('Founder email is required');
    }

    const founderEmail = dto.founderEmail;
    const founderEmailHash = hashFounderEmail(founderEmail);
    const normalizedCompanyName = normalizeScreeningCompanyNameForDuplicateMatching(
      dto.name,
    );

    // Abuse-prevention gate runs BEFORE normalization/dedupe so we never
    // create a user or hit the canonical lookup for a rate-limited attempt.
    // Failures still get an audit row written so we can investigate later.
    const decision = await this.rateLimit.checkAttempt({
      portalId,
      linkIntegrity: portalData.linkIntegrity as PortalLinkIntegrity,
      founderEmailHash,
      ipAddress: context.ipAddress,
      normalizedCompanyName,
    });

    if (decision.kind === 'rate_limited') {
      const audit = await this.rateLimit.recordOutcome({
        portalId,
        founderEmail,
        founderEmailHash,
        ipAddress: context.ipAddress,
        submittedCompanyName: dto.name,
        normalizedCompanyName,
        outcome: PortalSubmissionAuditOutcome.RATE_LIMITED,
        startupId: null,
      });
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: decision.message,
          outcome: PortalSubmissionAuditOutcome.RATE_LIMITED,
          auditId: audit?.id ?? null,
          retryAfterSeconds: decision.retryAfterSeconds,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    if (decision.kind === 'duplicate_within_window') {
      const audit = await this.rateLimit.recordOutcome({
        portalId,
        founderEmail,
        founderEmailHash,
        ipAddress: context.ipAddress,
        submittedCompanyName: dto.name,
        normalizedCompanyName,
        outcome: PortalSubmissionAuditOutcome.DUPLICATE_WITHIN_WINDOW,
        startupId: decision.matchedStartupId,
      });
      throw new ConflictException({
        statusCode: HttpStatus.CONFLICT,
        message: decision.message,
        outcome: PortalSubmissionAuditOutcome.DUPLICATE_WITHIN_WINDOW,
        auditId: audit?.id ?? null,
        matchedStartupId: decision.matchedStartupId,
      });
    }

    // Allow path — proceed with dev's canonical normalization + dedupe.
    let foundUser = await this.userAuth.findUserByEmail(founderEmail);
    if (!foundUser) {
      foundUser = await this.userAuth.createUser({
        email: founderEmail,
        name: dto.founderName || founderEmail.split('@')[0],
        emailVerified: false,
      });
      this.logger.log(`Created new user for founder ${founderEmail}`);
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
            sourcePath: StartupSourcePath.FOUNDER_SUBMITTED,
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

    const audit = await this.rateLimit.recordOutcome({
      portalId,
      founderEmail,
      founderEmailHash,
      ipAddress: context.ipAddress,
      submittedCompanyName: dto.name,
      normalizedCompanyName,
      outcome: PortalSubmissionAuditOutcome.ACCEPTED,
      startupId: result.startupId,
    });

    // Only kick off the pipeline for genuinely new startups. Reused-duplicate
    // links should not re-trigger a full analysis on the canonical record.
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

    return {
      outcome: PortalSubmissionAuditOutcome.ACCEPTED,
      submission: result.submission,
      auditId: audit?.id ?? null,
    };
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

  /**
   * Admin read-only view of the public portal abuse audit log. Filtered to
   * one portal so an admin investigating a specific portal sees only its
   * attempts.
   */
  async listAudit(
    portalId: string,
    options: { since?: Date; limit?: number } = {},
  ): Promise<
    {
      id: string;
      portalId: string;
      founderEmail: string | null;
      ipAddress: string | null;
      submittedCompanyName: string | null;
      normalizedCompanyName: string | null;
      outcome: string;
      startupId: string | null;
      createdAt: Date;
    }[]
  > {
    const { since, limit = 100 } = options;
    const conditions = [eq(portalSubmissionAudit.portalId, portalId)];
    if (since) {
      conditions.push(sql`${portalSubmissionAudit.createdAt} >= ${since}`);
    }
    const rows = await this.drizzle.db
      .select({
        id: portalSubmissionAudit.id,
        portalId: portalSubmissionAudit.portalId,
        founderEmail: portalSubmissionAudit.founderEmail,
        ipAddress: portalSubmissionAudit.ipAddress,
        submittedCompanyName: portalSubmissionAudit.submittedCompanyName,
        normalizedCompanyName: portalSubmissionAudit.normalizedCompanyName,
        outcome: portalSubmissionAudit.outcome,
        startupId: portalSubmissionAudit.startupId,
        createdAt: portalSubmissionAudit.createdAt,
      })
      .from(portalSubmissionAudit)
      .where(and(...conditions))
      .orderBy(desc(portalSubmissionAudit.createdAt))
      .limit(limit);
    return rows;
  }
}
