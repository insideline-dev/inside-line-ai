import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from "@nestjs/common";
import { eq, and, or, ilike, sql, desc } from "drizzle-orm";
import { UserRole } from "../../auth/entities/auth.schema";
import { DrizzleService } from "../../database";
import { QueueService, QUEUE_NAMES } from "../../queue";
import { StorageService } from "../../storage";
import { AiConfigService } from "../ai/services/ai-config.service";
import type {
  EvaluationAgentKey,
  ResearchAgentKey,
} from "../ai/interfaces/agent.interface";
import { PipelineService } from "../ai/services/pipeline.service";
import { ModelPurpose, PipelinePhase } from "../ai/interfaces/pipeline.interface";
import { PipelineFeedbackService } from "../ai/services/pipeline-feedback.service";
import { StartupMatchingPipelineService } from "../ai/services/startup-matching-pipeline.service";
import { pipelineAgentRun } from "../ai/entities";
import { startup, StartupStatus } from "./entities/startup.schema";
import { agentConversation } from "../agent/entities/agent.schema";
import { investorInboxSubmission } from "../integrations/agentmail/entities/investor-inbox-submission.schema";
import {
  CreateStartup,
  UpdateStartup,
  GetStartupsQuery,
  GetApprovedStartupsQuery,
  PresignedUrl,
  GetProgressResponse,
} from "./dto";
import { DraftService } from "./draft.service";
import {
  analysisJob,
  startupEvaluation,
  type StartupEvaluation,
} from "../analysis/entities/analysis.schema";
import { deriveStartupGeography } from "../geography";

function escapeIlike(input: string): string {
  return input.replace(/[%_\\]/g, (ch) => `\\${ch}`).slice(0, 200);
}

export interface AdminRetryPhaseRequest {
  phase: PipelinePhase;
  forceRerun?: boolean;
  feedback?: string;
}

export interface AdminRetryAgentRequest {
  phase: PipelinePhase.RESEARCH | PipelinePhase.EVALUATION;
  agent: string;
  feedback?: string;
}

@Injectable()
export class StartupService {
  private readonly logger = new Logger(StartupService.name);
  private static readonly EVALUATION_AGENT_SOURCES = [
    {
      key: "teamagent",
      agent: "TeamAgent",
      description: "Team composition and founder-market fit analysis",
      scoreField: "teamScore",
    },
    {
      key: "marketagent",
      agent: "MarketAgent",
      description: "Market opportunity and TAM/SAM/SOM analysis",
      scoreField: "marketScore",
    },
    {
      key: "productagent",
      agent: "ProductAgent",
      description: "Product quality and defensibility analysis",
      scoreField: "productScore",
    },
    {
      key: "tractionagent",
      agent: "TractionAgent",
      description: "Growth trajectory and validation analysis",
      scoreField: "tractionScore",
    },
    {
      key: "businessmodelagent",
      agent: "BusinessModelAgent",
      description: "Business model and unit economics analysis",
      scoreField: "businessModelScore",
    },
    {
      key: "gtmagent",
      agent: "GTMAgent",
      description: "Go-to-market strategy analysis",
      scoreField: "gtmScore",
    },
    {
      key: "financialsagent",
      agent: "FinancialsAgent",
      description: "Financial health and runway analysis",
      scoreField: "financialsScore",
    },
    {
      key: "competitiveadvantageagent",
      agent: "CompetitiveAdvantageAgent",
      description: "Competitive moat and positioning analysis",
      scoreField: "competitiveAdvantageScore",
    },
    {
      key: "legalregulatoryagent",
      agent: "LegalRegulatoryAgent",
      description: "Legal, regulatory and IP analysis",
      scoreField: "legalScore",
    },
    {
      key: "dealtermsagent",
      agent: "DealTermsAgent",
      description: "Deal terms and valuation analysis",
      scoreField: "dealTermsScore",
    },
    {
      key: "exitpotentialagent",
      agent: "ExitPotentialAgent",
      description: "Exit potential and M&A analysis",
      scoreField: "exitPotentialScore",
    },
  ] as const;
  private static readonly EVALUATION_SECTION_DATA_FIELDS = [
    "teamData",
    "marketData",
    "productData",
    "tractionData",
    "businessModelData",
    "gtmData",
    "financialsData",
    "competitiveAdvantageData",
    "legalData",
    "dealTermsData",
    "exitPotentialData",
  ] as const;
  private static readonly RESEARCH_AGENTS = new Set<
    ResearchAgentKey
  >(["team", "market", "product", "news", "competitor"]);
  private static readonly EVALUATION_AGENTS = new Set<
    EvaluationAgentKey
  >([
    "team",
    "market",
    "product",
    "traction",
    "businessModel",
    "gtm",
    "financials",
    "competitiveAdvantage",
    "legal",
    "dealTerms",
    "exitPotential",
  ]);

  constructor(
    private drizzle: DrizzleService,
    private queue: QueueService,
    private storage: StorageService,
    private draftService: DraftService,
    private aiConfig: AiConfigService,
    private aiPipeline: PipelineService,
    private pipelineFeedback: PipelineFeedbackService,
    private startupMatching: StartupMatchingPipelineService,
  ) {}

  private generateSlug(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  async create(
    userId: string,
    dto: CreateStartup,
    submittedByRole: UserRole = UserRole.FOUNDER,
    options?: {
      scoutId?: string;
      isPrivate?: boolean;
    },
  ) {
    return this.drizzle.withRLS(userId, async (db) => {
      const slug = this.generateSlug(dto.name);
      const geography = deriveStartupGeography(dto.location);
      const isInvestorSubmission = submittedByRole === UserRole.INVESTOR;

      const [created] = await db
        .insert(startup)
        .values({
          userId,
          submittedByRole,
          scoutId: options?.scoutId ?? (submittedByRole === UserRole.SCOUT ? userId : undefined),
          isPrivate: options?.isPrivate ?? isInvestorSubmission,
          slug,
          ...dto,
          normalizedRegion: geography.normalizedRegion,
          geoCountryCode: geography.countryCode,
          geoLevel1: geography.level1,
          geoLevel2: geography.level2,
          geoLevel3: geography.level3,
          geoPath: geography.path,
          status: StartupStatus.DRAFT,
        })
        .returning();

      this.logger.log(`Created startup ${created.id} by user ${userId}`);
      return created;
    });
  }

  async findAll(userId: string, query: GetStartupsQuery) {
    return this.drizzle.withRLS(userId, async (db) => {
      const { page, limit, status, industry, stage, search } = query;
      const offset = (page - 1) * limit;

      const conditions = [eq(startup.userId, userId)];

      if (status) {
        conditions.push(eq(startup.status, status));
      }
      if (industry) {
        conditions.push(eq(startup.industry, industry));
      }
      if (stage) {
        conditions.push(eq(startup.stage, stage));
      }
      if (search) {
        const escaped = escapeIlike(search);
        conditions.push(
          or(
            ilike(startup.name, `%${escaped}%`),
            ilike(startup.tagline, `%${escaped}%`),
            ilike(startup.description, `%${escaped}%`),
          )!,
        );
      }

      const whereClause = and(...conditions);

      const [items, [{ count }]] = await Promise.all([
        db
          .select()
          .from(startup)
          .where(whereClause)
          .orderBy(desc(startup.createdAt))
          .limit(limit)
          .offset(offset),
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(startup)
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

  async findOne(id: string, userId: string) {
    return this.drizzle.withRLS(userId, async (db) => {
      const [found] = await db
        .select()
        .from(startup)
        .where(and(eq(startup.id, id), eq(startup.userId, userId)))
        .limit(1);

      if (!found) {
        throw new NotFoundException(`Startup with ID ${id} not found`);
      }

      return this.withEvaluation(db, found, false);
    });
  }

  async adminFindOne(id: string) {
    const [found] = await this.drizzle.db
      .select()
      .from(startup)
      .where(eq(startup.id, id))
      .limit(1);

    if (!found) {
      throw new NotFoundException(`Startup with ID ${id} not found`);
    }

    return this.withEvaluation(this.drizzle.db, found, true);
  }

  async update(id: string, userId: string, dto: UpdateStartup) {
    return this.drizzle.withRLS(userId, async (db) => {
      const existing = await this.findOne(id, userId);

      if (
        existing.status === StartupStatus.SUBMITTED ||
        existing.status === StartupStatus.APPROVED
      ) {
        throw new ForbiddenException(
          "Cannot edit startup while submitted or approved",
        );
      }

      const geographyUpdate = dto.location
        ? deriveStartupGeography(dto.location)
        : null;

      const [updated] = await db
        .update(startup)
        .set({
          ...dto,
          ...(geographyUpdate
            ? {
                normalizedRegion: geographyUpdate.normalizedRegion,
                geoCountryCode: geographyUpdate.countryCode,
                geoLevel1: geographyUpdate.level1,
                geoLevel2: geographyUpdate.level2,
                geoLevel3: geographyUpdate.level3,
                geoPath: geographyUpdate.path,
              }
            : {}),
          updatedAt: new Date(),
        })
        .where(eq(startup.id, id))
        .returning();

      this.logger.log(`Updated startup ${id}`);
      return updated;
    });
  }

  async delete(id: string, userId: string) {
    return this.drizzle.withRLS(userId, async (db) => {
      const existing = await this.findOne(id, userId);

      if (existing.status !== StartupStatus.DRAFT) {
        throw new ForbiddenException("Can only delete draft startups");
      }

      await db.delete(startup).where(eq(startup.id, id));

      this.logger.log(`Deleted startup ${id}`);
    });
  }

  async submit(id: string, userId: string) {
    return this.drizzle.withRLS(userId, async (db) => {
      const existing = await this.findOne(id, userId);

      if (existing.status !== StartupStatus.DRAFT) {
        throw new BadRequestException("Can only submit draft startups");
      }

      const [updated] = await db
        .update(startup)
        .set({
          status: StartupStatus.SUBMITTED,
          submittedAt: new Date(),
        })
        .where(eq(startup.id, id))
        .returning();

      await this.draftService.delete(id);

      await this.triggerAnalysis(id, userId);

      this.logger.log(`Submitted startup ${id} for review`);
      return updated;
    });
  }

  async resubmit(id: string, userId: string) {
    return this.drizzle.withRLS(userId, async (db) => {
      const existing = await this.findOne(id, userId);

      if (existing.status !== StartupStatus.REJECTED) {
        throw new BadRequestException("Can only resubmit rejected startups");
      }

      const [updated] = await db
        .update(startup)
        .set({
          status: StartupStatus.SUBMITTED,
          submittedAt: new Date(),
          rejectionReason: null,
          rejectedAt: null,
        })
        .where(eq(startup.id, id))
        .returning();

      await this.triggerAnalysis(id, userId);

      this.logger.log(`Resubmitted startup ${id}`);
      return updated;
    });
  }

  async approve(
    id: string,
    actorId: string,
    actorRole: UserRole = UserRole.ADMIN,
  ) {
    const [found] = await this.drizzle.db
      .select()
      .from(startup)
      .where(eq(startup.id, id))
      .limit(1);

    if (!found) {
      throw new NotFoundException(`Startup with ID ${id} not found`);
    }

    if (
      found.status !== StartupStatus.SUBMITTED &&
      found.status !== StartupStatus.PENDING_REVIEW
    ) {
      throw new BadRequestException(
        "Can only approve submitted or pending review startups",
      );
    }

    if (actorRole === UserRole.INVESTOR) {
      const isOwner = found.userId === actorId;
      const isPrivateInvestorSubmission =
        found.isPrivate === true && found.submittedByRole === UserRole.INVESTOR;

      if (!isOwner || !isPrivateInvestorSubmission) {
        throw new ForbiddenException(
          "Investors can only approve their own private startups",
        );
      }
    }

    const [updated] = await this.drizzle.db
      .update(startup)
      .set({
        status: StartupStatus.APPROVED,
        approvedAt: new Date(),
      })
      .where(eq(startup.id, id))
      .returning();

    try {
      const queued = await this.startupMatching.queueStartupMatching({
        startupId: id,
        requestedBy: actorId,
        triggerSource: "approval",
      });
      this.logger.log(
        `Queued startup matching for ${id} (analysisJobId=${queued.analysisJobId}, queueJobId=${queued.queueJobId})`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Approval succeeded but matching queue failed for startup ${id}: ${message}`,
      );
    }

    this.logger.log(`Approved startup ${id} by ${actorRole} ${actorId}`);
    return updated;
  }

  async reject(
    id: string,
    actorId: string,
    rejectionReason: string,
    actorRole: UserRole = UserRole.ADMIN,
  ) {
    const [found] = await this.drizzle.db
      .select()
      .from(startup)
      .where(eq(startup.id, id))
      .limit(1);

    if (!found) {
      throw new NotFoundException(`Startup with ID ${id} not found`);
    }

    if (
      found.status !== StartupStatus.SUBMITTED &&
      found.status !== StartupStatus.PENDING_REVIEW
    ) {
      throw new BadRequestException(
        "Can only reject submitted or pending review startups",
      );
    }

    if (actorRole === UserRole.INVESTOR) {
      const isOwner = found.userId === actorId;
      const isPrivateInvestorSubmission =
        found.isPrivate === true && found.submittedByRole === UserRole.INVESTOR;

      if (!isOwner || !isPrivateInvestorSubmission) {
        throw new ForbiddenException(
          "Investors can only reject their own private startups",
        );
      }
    }

    const [updated] = await this.drizzle.db
      .update(startup)
      .set({
        status: StartupStatus.REJECTED,
        rejectedAt: new Date(),
        rejectionReason,
      })
      .where(eq(startup.id, id))
      .returning();

    this.logger.log(`Rejected startup ${id} by ${actorRole} ${actorId}`);
    return updated;
  }

  async reanalyze(id: string, adminId: string) {
    const [found] = await this.drizzle.db
      .select()
      .from(startup)
      .where(eq(startup.id, id))
      .limit(1);

    if (!found) {
      throw new NotFoundException(`Startup with ID ${id} not found`);
    }

    let jobId: string;
    if (this.aiConfig.isPipelineEnabled()) {
      jobId = await this.aiPipeline.startPipeline(id, adminId);
    } else {
      jobId = await this.queue.addJob(
        QUEUE_NAMES.TASK,
        {
          type: "task",
          userId: adminId,
          name: "reanalyze-startup",
          priority: 3,
          payload: { startupId: id },
        },
        { priority: 3 },
      );
    }

    this.logger.log(`Queued reanalysis for startup ${id}`);
    return { jobId };
  }

  async adminRetryPhase(
    id: string,
    adminId: string,
    request: AdminRetryPhaseRequest,
  ) {
    const [found] = await this.drizzle.db
      .select()
      .from(startup)
      .where(eq(startup.id, id))
      .limit(1);

    if (!found) {
      throw new NotFoundException(`Startup with ID ${id} not found`);
    }

    if (!this.aiConfig.isPipelineEnabled()) {
      throw new BadRequestException("AI pipeline is disabled");
    }
    if (!this.isValidPipelinePhase(request.phase)) {
      throw new BadRequestException(`Unsupported phase "${String(request.phase)}"`);
    }

    const feedback = request.feedback?.trim();

    if (feedback) {
      await this.pipelineFeedback.record({
        startupId: id,
        phase: request.phase,
        feedback,
        createdBy: adminId,
        metadata: {
          source: "admin_retry_phase",
          forceRerun: Boolean(request.forceRerun),
        },
      });
    }

    if (request.forceRerun) {
      await this.aiPipeline.rerunFromPhase(id, request.phase);
    } else {
      await this.aiPipeline.retryPhase(id, request.phase);
    }

    this.logger.log(
      `Admin ${adminId} requested phase retry for startup ${id}, phase ${request.phase}`,
    );

    return {
      startupId: id,
      phase: request.phase,
      accepted: true,
      mode: request.forceRerun ? "force_rerun" : "retry_failed_phase",
      feedbackAccepted: Boolean(feedback),
    };
  }

  async adminRetryAgent(
    id: string,
    adminId: string,
    request: AdminRetryAgentRequest,
  ) {
    const [found] = await this.drizzle.db
      .select()
      .from(startup)
      .where(eq(startup.id, id))
      .limit(1);

    if (!found) {
      throw new NotFoundException(`Startup with ID ${id} not found`);
    }

    if (!this.aiConfig.isPipelineEnabled()) {
      throw new BadRequestException("AI pipeline is disabled");
    }
    if (!this.isValidRetryAgentRequest(request.phase, request.agent)) {
      throw new BadRequestException(
        `Unsupported agent "${request.agent}" for phase "${String(request.phase)}"`,
      );
    }

    const feedback = request.feedback?.trim();

    if (feedback) {
      await this.pipelineFeedback.record({
        startupId: id,
        phase: request.phase,
        agentKey: request.agent,
        feedback,
        createdBy: adminId,
        metadata: {
          source: "admin_retry_agent",
        },
      });
    }

    let mode: "agent_retry" | "full_reanalysis_fallback" = "agent_retry";
    const existingState = await this.aiPipeline.getPipelineStatus(id);
    if (!existingState) {
      mode = "full_reanalysis_fallback";
      await this.aiPipeline.startPipeline(id, found.userId);
      this.logger.warn(
        `Pipeline state missing for startup ${id}; falling back to full reanalysis for admin retry request`,
      );
    } else {
      await this.aiPipeline.retryAgent(id, {
        phase: request.phase,
        agentKey: request.agent as ResearchAgentKey | EvaluationAgentKey,
      });
    }

    this.logger.log(
      `Admin ${adminId} requested agent retry for startup ${id}, phase ${request.phase}, agent ${request.agent}`,
    );

    return {
      startupId: id,
      phase: request.phase,
      agent: request.agent,
      accepted: true,
      feedbackAccepted: Boolean(feedback),
      mode,
    };
  }

  async adminUpdate(id: string, dto: UpdateStartup) {
    const [found] = await this.drizzle.db
      .select()
      .from(startup)
      .where(eq(startup.id, id))
      .limit(1);

    if (!found) {
      throw new NotFoundException(`Startup with ID ${id} not found`);
    }

    const geographyUpdate = dto.location
      ? deriveStartupGeography(dto.location)
      : null;

    const [updated] = await this.drizzle.db
      .update(startup)
      .set({
        ...dto,
        ...(geographyUpdate
          ? {
              normalizedRegion: geographyUpdate.normalizedRegion,
              geoCountryCode: geographyUpdate.countryCode,
              geoLevel1: geographyUpdate.level1,
              geoLevel2: geographyUpdate.level2,
              geoLevel3: geographyUpdate.level3,
              geoPath: geographyUpdate.path,
            }
          : {}),
        updatedAt: new Date(),
      })
      .where(eq(startup.id, id))
      .returning();

    this.logger.log(`Admin updated startup ${id}`);
    return updated;
  }

  async adminDelete(id: string) {
    const [found] = await this.drizzle.db
      .select()
      .from(startup)
      .where(eq(startup.id, id))
      .limit(1);

    if (!found) {
      throw new NotFoundException(`Startup with ID ${id} not found`);
    }

    await this.drizzle.db.transaction(async (tx) => {
      // Non-cascading references: clear these before deleting startup.
      await tx
        .update(agentConversation)
        .set({ currentStartupId: null, updatedAt: new Date() })
        .where(eq(agentConversation.currentStartupId, id));

      await tx
        .delete(investorInboxSubmission)
        .where(eq(investorInboxSubmission.startupId, id));

      await tx.delete(startup).where(eq(startup.id, id));
    });

    this.logger.log(`Admin deleted startup ${id}`);
  }

  async adminFindAll(query: GetStartupsQuery) {
    const { page, limit, status, industry, stage, search } = query;
    const offset = (page - 1) * limit;

    const conditions = [];

    if (status) {
      conditions.push(eq(startup.status, status));
    }
    if (industry) {
      conditions.push(eq(startup.industry, industry));
    }
    if (stage) {
      conditions.push(eq(startup.stage, stage));
    }
    if (search) {
      const escaped = escapeIlike(search);
      conditions.push(
        or(
          ilike(startup.name, `%${escaped}%`),
          ilike(startup.tagline, `%${escaped}%`),
          ilike(startup.description, `%${escaped}%`),
        )!,
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [items, [{ count }]] = await Promise.all([
      this.drizzle.db
        .select()
        .from(startup)
        .where(whereClause)
        .orderBy(desc(startup.createdAt))
        .limit(limit)
        .offset(offset),
      this.drizzle.db
        .select({ count: sql<number>`count(*)::int` })
        .from(startup)
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

  async adminFindPending(query: GetStartupsQuery) {
    return this.adminFindAll({
      ...query,
      status: StartupStatus.SUBMITTED,
    });
  }

  async findApproved(query: GetApprovedStartupsQuery) {
    const { page, limit, industry, stage, location, search } = query;
    const offset = (page - 1) * limit;

    const conditions = [eq(startup.status, StartupStatus.APPROVED)];

    if (industry) {
      conditions.push(eq(startup.industry, industry));
    }
    if (stage) {
      conditions.push(eq(startup.stage, stage));
    }
    if (location) {
      conditions.push(ilike(startup.location, `%${escapeIlike(location)}%`));
    }
    if (search) {
      const escaped = escapeIlike(search);
      conditions.push(
        or(
          ilike(startup.name, `%${escaped}%`),
          ilike(startup.tagline, `%${escaped}%`),
          ilike(startup.description, `%${escaped}%`),
        )!,
      );
    }

    const whereClause = and(...conditions);

    const [items, [{ count }]] = await Promise.all([
      this.drizzle.db
        .select()
        .from(startup)
        .where(whereClause)
        .orderBy(desc(startup.approvedAt))
        .limit(limit)
        .offset(offset),
      this.drizzle.db
        .select({ count: sql<number>`count(*)::int` })
        .from(startup)
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

  async findApprovedById(id: string) {
    const [found] = await this.drizzle.db
      .select()
      .from(startup)
      .where(
        and(eq(startup.id, id), eq(startup.status, StartupStatus.APPROVED)),
      )
      .limit(1);

    if (!found) {
      throw new NotFoundException("Approved startup not found");
    }

    return found;
  }

  async findBySlug(slug: string) {
    const [found] = await this.drizzle.db
      .select()
      .from(startup)
      .where(
        and(eq(startup.slug, slug), eq(startup.status, StartupStatus.APPROVED)),
      )
      .limit(1);

    if (!found) {
      throw new NotFoundException("Startup not found");
    }

    return found;
  }

  private static readonly ALLOWED_UPLOAD_TYPES = new Set([
    "application/pdf",
    "image/png",
    "image/jpeg",
    "image/webp",
    "image/gif",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "application/vnd.ms-powerpoint",
  ]);

  async getUploadUrl(id: string, userId: string, dto: PresignedUrl) {
    if (!StartupService.ALLOWED_UPLOAD_TYPES.has(dto.fileType)) {
      throw new BadRequestException(
        `File type '${dto.fileType}' is not allowed. Accepted: PDF, PNG, JPEG, WebP, GIF, PPTX, PPT`,
      );
    }

    await this.findOne(id, userId);

    const assetType = dto.fileType.startsWith("application/")
      ? "pitch-deck"
      : "startup-assets";

    const result = await this.storage.getUploadUrl(
      userId,
      assetType as any,
      dto.fileType,
      id,
    );

    return result;
  }

  async getJobs(startupId: string, userId: string) {
    await this.findOne(startupId, userId);

    const jobs = await this.drizzle.withRLS(userId, (db) =>
      db
        .select()
        .from(analysisJob)
        .where(eq(analysisJob.startupId, startupId))
        .orderBy(desc(analysisJob.createdAt))
        .limit(100),
    );

    return {
      jobs,
    };
  }

  async adminGetJobs(startupId: string) {
    const [found] = await this.drizzle.db
      .select({ id: startup.id })
      .from(startup)
      .where(eq(startup.id, startupId))
      .limit(1);

    if (!found) {
      throw new NotFoundException(`Startup with ID ${startupId} not found`);
    }

    const jobs = await this.drizzle.db
      .select()
      .from(analysisJob)
      .where(eq(analysisJob.startupId, startupId))
      .orderBy(desc(analysisJob.createdAt))
      .limit(100);

    return { jobs };
  }

  async getProgress(id: string, userId: string): Promise<GetProgressResponse> {
    return this.drizzle.withRLS(userId, async (db) => {
      const [found] = await db
        .select()
        .from(startup)
        .where(and(eq(startup.id, id), eq(startup.userId, userId)))
        .limit(1);

      if (!found) {
        throw new NotFoundException(`Startup with ID ${id} not found`);
      }

      return this.buildProgressResponse(db, id, found.status, {
        includeAdminDetails: false,
      });
    });
  }

  async adminGetProgress(id: string): Promise<GetProgressResponse> {
    const [found] = await this.drizzle.db
      .select()
      .from(startup)
      .where(eq(startup.id, id))
      .limit(1);

    if (!found) {
      throw new NotFoundException(`Startup with ID ${id} not found`);
    }

    return this.buildProgressResponse(this.drizzle.db, id, found.status, {
      includeAdminDetails: true,
    });
  }

  private async triggerAnalysis(
    startupId: string,
    userId: string,
  ): Promise<void> {
    if (this.aiConfig.isPipelineEnabled()) {
      await this.aiPipeline.startPipeline(startupId, userId);
      return;
    }

    await this.queue.addJob(
      QUEUE_NAMES.TASK,
      {
        type: "task",
        userId,
        name: "score-startup",
        priority: 1,
        payload: { startupId },
      },
      { priority: 1 },
    );
  }

  async getEvaluation(startupId: string) {
    const [evaluation] = await this.drizzle.db
      .select()
      .from(startupEvaluation)
      .where(eq(startupEvaluation.startupId, startupId))
      .limit(1);

    if (!evaluation) {
      throw new NotFoundException("Evaluation not found");
    }

    return this.withModelSources(evaluation);
  }

  private async withEvaluation<
    T extends { id: string; status?: StartupStatus | string | null },
  >(
    db: DrizzleService["db"],
    startupRecord: T,
    includePreApproval: boolean,
  ): Promise<T & { evaluation?: StartupEvaluation }> {
    const status = startupRecord.status;
    const includeEvaluation =
      status === StartupStatus.APPROVED ||
      (includePreApproval &&
        (status === StartupStatus.ANALYZING ||
          status === StartupStatus.PENDING_REVIEW));

    if (!includeEvaluation) {
      return startupRecord;
    }

    const [evaluation] = await db
      .select()
      .from(startupEvaluation)
      .where(eq(startupEvaluation.startupId, startupRecord.id))
      .limit(1);

    if (!evaluation) {
      return startupRecord;
    }

    return {
      ...startupRecord,
      evaluation: this.withModelSources(evaluation),
    };
  }

  private withModelSources(evaluation: StartupEvaluation): StartupEvaluation {
    const evaluationWithNarratives = this.withMemoNarratives(evaluation);
    const rawSources = Array.isArray(evaluationWithNarratives.sources)
      ? evaluationWithNarratives.sources
      : [];
    const baseSources = rawSources.map((source) =>
      source && typeof source === "object"
        ? { ...(source as Record<string, unknown>) }
        : source,
    );

    const evaluationModel = this.aiConfig.getModelForPurpose(
      ModelPurpose.EVALUATION,
    );
    const synthesisModel = this.aiConfig.getModelForPurpose(
      ModelPurpose.SYNTHESIS,
    );
    const knownEvaluationAgents = new Set<string>(
      StartupService.EVALUATION_AGENT_SOURCES.map((entry) => entry.key),
    );
    const knownSynthesisAgent = "synthesisagent";
    const existingModelAgents = new Set<string>();

    for (const source of baseSources) {
      if (!source || typeof source !== "object") {
        continue;
      }

      const sourceRecord = source as Record<string, unknown>;
      const sourceType =
        typeof sourceRecord.type === "string" ? sourceRecord.type.toLowerCase() : "";
      const sourceCategory =
        typeof sourceRecord.category === "string"
          ? sourceRecord.category.toLowerCase()
          : "";
      const hasModel =
        typeof sourceRecord.model === "string" &&
        sourceRecord.model.trim().length > 0;
      const isApiLike = sourceType === "api" || sourceCategory === "api" || hasModel;

      if (!isApiLike) {
        continue;
      }

      const normalizedAgent = this.normalizeAgentKey(sourceRecord.agent);
      if (!normalizedAgent) {
        continue;
      }

      const isKnownEvaluationAgent = knownEvaluationAgents.has(normalizedAgent);
      const isKnownSynthesisAgent = normalizedAgent === knownSynthesisAgent;
      if (!isKnownEvaluationAgent && !isKnownSynthesisAgent) {
        continue;
      }

      const model = isKnownSynthesisAgent ? synthesisModel : evaluationModel;
      sourceRecord.category = "api";
      sourceRecord.type = "api";
      sourceRecord.model = model;
      sourceRecord.name = model;
      existingModelAgents.add(normalizedAgent);
    }

    const timestamp = this.toIsoTimestamp(evaluation.updatedAt);

    const missingModelSources = StartupService.EVALUATION_AGENT_SOURCES
      .filter((entry) => !existingModelAgents.has(entry.key))
      .map((entry) => {
        const scoreValue = (evaluation as Record<string, unknown>)[entry.scoreField];
        return {
          category: "api",
          type: "api",
          name: evaluationModel,
          model: evaluationModel,
          agent: entry.agent,
          description: entry.description,
          relevance:
            typeof scoreValue === "number"
              ? `Score: ${Math.round(scoreValue)}`
              : undefined,
          timestamp,
        } as Record<string, unknown>;
      });

    const synthesisAgentKey = "synthesisagent";
    if (!existingModelAgents.has(synthesisAgentKey)) {
      const overallScore = evaluation.overallScore;
      missingModelSources.push({
        category: "api",
        type: "api",
        name: synthesisModel,
        model: synthesisModel,
        agent: "SynthesisAgent",
        description: "Final synthesis and investor memo generation",
        relevance:
          typeof overallScore === "number"
            ? `Score: ${Math.round(overallScore)}`
            : undefined,
        timestamp,
      });
    }

    if (missingModelSources.length === 0) {
      return evaluationWithNarratives;
    }

    return {
      ...evaluationWithNarratives,
      sources: [...baseSources, ...missingModelSources],
    };
  }

  private withMemoNarratives(evaluation: StartupEvaluation): StartupEvaluation {
    const updated: Record<string, unknown> = { ...evaluation };

    for (const field of StartupService.EVALUATION_SECTION_DATA_FIELDS) {
      updated[field] = this.ensureMemoNarrative(updated[field]);
    }

    return updated as StartupEvaluation;
  }

  private ensureMemoNarrative(section: unknown): unknown {
    if (!section || typeof section !== "object" || Array.isArray(section)) {
      return section;
    }

    const record = { ...(section as Record<string, unknown>) };
    const existingNarrative = this.pickNarrative(record);
    const normalizedExisting = existingNarrative?.trim() ?? "";
    if (this.isDetailedNarrative(normalizedExisting)) {
      record.narrativeSummary = normalizedExisting;
      record.memoNarrative = normalizedExisting;
      return record;
    }

    const feedback = this.readString(record.feedback);
    const score = this.readNumber(record.score);
    const confidence = this.readNumber(record.confidence);
    const keyFindings = this.readStringArray(record.keyFindings).slice(0, 4);
    const risks = this.readStringArray(record.risks).slice(0, 3);
    const dataGaps = this.readStringArray(record.dataGaps).slice(0, 3);

    const confidencePercent =
      confidence !== null ? Math.round(confidence * 100) : null;
    const paragraphOneParts = [
      score !== null
        ? `This section is currently scored at ${Math.round(score)}/100${confidencePercent !== null ? ` with ${confidencePercent}% confidence` : ""}.`
        : "This section currently has directional signal but limited confidence due to sparse evidence.",
      feedback ||
        "The current assessment should be treated as provisional pending additional primary-source diligence.",
    ].filter((part) => part.length > 0);
    const paragraphOne = paragraphOneParts.join(" ").trim();

    const paragraphTwo = keyFindings.length
      ? `Primary evidence signals include ${this.joinList(keyFindings)}. These indicators support a constructive directional view for this dimension, but should still be validated against independent sources where possible.`
      : "Evidence depth remains limited in this run, so the current narrative should be interpreted as an early diligence snapshot rather than a final IC view.";

    const paragraphThree = keyFindings.length
      ? "Execution implications are cautiously positive if the observed signals can be sustained and converted into repeatable outcomes. At current evidence depth, this should be viewed as a promising but not fully de-risked section."
      : "Execution implications remain uncertain due to limited repeatable evidence. Additional operating and performance transparency is required before this section can support high conviction.";

    const paragraphFourParts: string[] = [];
    if (risks.length > 0) {
      paragraphFourParts.push(
        `Key risks include ${this.joinList(risks)}, which could materially change conviction if unaddressed.`,
      );
    }
    if (dataGaps.length > 0) {
      paragraphFourParts.push(
        `Critical data gaps include ${this.joinList(dataGaps)} and should be resolved before final investment recommendation.`,
      );
    }
    const paragraphFour =
      paragraphFourParts.join(" ") ||
      "No critical unresolved blockers were explicitly identified in this section, but continued monitoring is recommended as new evidence arrives.";

    const paragraphFive =
      "Recommended next diligence should focus on third-party validation of key claims, trend consistency checks over multiple periods, and explicit downside stress-testing before final IC commitment.";

    const narrative = [
      paragraphOne,
      paragraphTwo,
      paragraphThree,
      paragraphFour,
      paragraphFive,
    ]
      .map((value) => value.trim())
      .filter((value) => value.length > 0)
      .join("\n\n");

    if (narrative.length > 0) {
      record.narrativeSummary = narrative;
      record.memoNarrative = narrative;
      if (!this.isDetailedNarrative(feedback ?? "")) {
        record.feedback = narrative;
      }
    }

    return record;
  }

  private pickNarrative(record: Record<string, unknown>): string | null {
    const candidateKeys = [
      "narrativeSummary",
      "memoNarrative",
      "feedback",
      "summary",
      "assessment",
      "analysis",
    ];
    for (const key of candidateKeys) {
      const value = this.readString(record[key]);
      if (value) {
        return value;
      }
    }
    return null;
  }

  private readString(value: unknown): string | null {
    if (typeof value !== "string") {
      return null;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  private readNumber(value: unknown): number | null {
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  }

  private readStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) {
      return [];
    }
    return value
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
  }

  private joinList(items: string[]): string {
    if (items.length === 0) {
      return "";
    }
    if (items.length === 1) {
      return items[0] ?? "";
    }
    if (items.length === 2) {
      return `${items[0]} and ${items[1]}`;
    }
    return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
  }

  private isDetailedNarrative(value: string): boolean {
    const trimmed = value.trim();
    if (trimmed.length < 420) {
      return false;
    }

    const paragraphs = trimmed
      .split(/\n\s*\n+/)
      .map((paragraph) => paragraph.trim())
      .filter((paragraph) => paragraph.length > 0);

    return paragraphs.length >= 4;
  }

  private normalizeAgentKey(agent: unknown): string | null {
    if (typeof agent !== "string" || agent.trim().length === 0) {
      return null;
    }

    return agent.toLowerCase().replace(/[^a-z]/g, "");
  }

  private toIsoTimestamp(value: unknown): string {
    if (value instanceof Date) {
      return value.toISOString();
    }

    if (typeof value === "string" && value.trim().length > 0) {
      const parsed = new Date(value);
      if (!Number.isNaN(parsed.getTime())) {
        return parsed.toISOString();
      }
    }

    return new Date().toISOString();
  }

  private parseTraceMeta(value: unknown): {
    fallbackReason?:
      | "EMPTY_STRUCTURED_OUTPUT"
      | "TIMEOUT"
      | "SCHEMA_OUTPUT_INVALID"
      | "MODEL_OR_PROVIDER_ERROR"
      | "UNHANDLED_AGENT_EXCEPTION";
    rawProviderError?: string;
    outputJson: unknown;
  } {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return { outputJson: value };
    }

    const record = value as Record<string, unknown>;
    const meta = record.__traceMeta;
    const traceOutput = record.__traceOutput;
    const outputJson = { ...record };
    delete outputJson.__traceMeta;
    delete outputJson.__traceOutput;
    const resolvedOutputJson =
      traceOutput !== undefined
        ? traceOutput
        : Object.keys(outputJson).length > 0
          ? outputJson
          : null;

    if (!meta || typeof meta !== "object" || Array.isArray(meta)) {
      return { outputJson: resolvedOutputJson };
    }

    const metaRecord = meta as Record<string, unknown>;
    const fallbackReason =
      metaRecord.fallbackReason === "EMPTY_STRUCTURED_OUTPUT" ||
      metaRecord.fallbackReason === "TIMEOUT" ||
      metaRecord.fallbackReason === "SCHEMA_OUTPUT_INVALID" ||
      metaRecord.fallbackReason === "MODEL_OR_PROVIDER_ERROR" ||
      metaRecord.fallbackReason === "UNHANDLED_AGENT_EXCEPTION"
        ? metaRecord.fallbackReason
        : undefined;
    const rawProviderError =
      typeof metaRecord.rawProviderError === "string"
        ? metaRecord.rawProviderError
        : undefined;

    return {
      fallbackReason,
      rawProviderError,
      outputJson: resolvedOutputJson,
    };
  }

  private async buildProgressResponse(
    db: DrizzleService["db"],
    startupId: string,
    status: StartupStatus,
    options?: {
      includeAdminDetails?: boolean;
    },
  ): Promise<GetProgressResponse> {
    const includeAdminDetails = options?.includeAdminDetails === true;
    const response: GetProgressResponse = {
      status,
      progress: null,
    };

    const [pipelineState, trackedProgress] = await Promise.all([
      this.aiPipeline.getPipelineStatus(startupId),
      this.aiPipeline.getTrackedProgress(startupId),
    ]);

    if (trackedProgress) {
      const phaseResults = pipelineState?.results ?? {};
      const agentTraces = includeAdminDetails
        ? await this.loadAgentTraces(startupId, trackedProgress.pipelineRunId)
        : [];

      response.progress = {
        overallProgress: this.normalizePercent(trackedProgress.overallProgress),
        currentPhase: trackedProgress.currentPhase,
        pipelineStatus: trackedProgress.status,
        pipelineRunId: trackedProgress.pipelineRunId,
        estimatedTimeRemaining: trackedProgress.estimatedTimeRemaining,
        updatedAt: trackedProgress.updatedAt,
        error:
          trackedProgress.error ??
          (trackedProgress.status === "failed"
            ? "Pipeline failed"
            : undefined),
        phasesCompleted: trackedProgress.phasesCompleted,
        phases: Object.fromEntries(
          Object.entries(trackedProgress.phases).map(([phase, value]) => {
            const phaseKey = this.isValidPipelinePhase(phase)
              ? phase
              : undefined;
            const phaseIssue = phaseKey
              ? this.derivePhaseIssue(phaseKey, phaseResults[phaseKey])
              : undefined;
            const shouldExposeIssue =
              value.status === "failed" ||
              value.status === "running" ||
              value.status === "waiting";

            const agents = Object.fromEntries(
              Object.entries(value.agents ?? {}).map(([agentKey, agent]) => {
                const baseAgent = {
                  key: agent.key,
                  status: agent.status,
                  progress:
                    typeof agent.progress === "number"
                      ? this.normalizePercent(agent.progress)
                      : undefined,
                  startedAt: agent.startedAt,
                  completedAt: agent.completedAt,
                  error: agent.error,
                };
                const adminAgentFields = includeAdminDetails
                  ? {
                      attempts: agent.attempts,
                      retryCount: agent.retryCount,
                      phaseRetryCount: agent.phaseRetryCount,
                      agentAttemptId: agent.agentAttemptId,
                      usedFallback: agent.usedFallback,
                      fallbackReason: agent.fallbackReason,
                      rawProviderError: agent.rawProviderError,
                      lastEvent: agent.lastEvent,
                      lastEventAt: agent.lastEventAt,
                    }
                  : {};
                return [agentKey, { ...baseAgent, ...adminAgentFields }];
              }),
            );

            return [
              phase,
              ({
                status: value.status,
                progress: this.resolvePhaseProgress(value.status, agents),
                startedAt: value.startedAt,
                completedAt: value.completedAt,
                error: shouldExposeIssue
                  ? (value.error ?? phaseIssue)
                  : undefined,
                ...(includeAdminDetails ? { retryCount: value.retryCount } : {}),
                agents: Object.keys(agents).length > 0 ? agents : undefined,
              }),
            ];
          }),
        ),
        ...(includeAdminDetails
          ? {
              agentEvents: (trackedProgress.agentEvents ?? []).map((event) => ({
                id: event.id,
                pipelineRunId: event.pipelineRunId,
                phase: event.phase,
                agentKey: event.agentKey,
                event: event.event,
                timestamp: event.timestamp,
                attempt: event.attempt,
                retryCount: event.retryCount,
                phaseRetryCount: event.phaseRetryCount,
                agentAttemptId: event.agentAttemptId,
                error: event.error,
                fallbackReason: event.fallbackReason,
                rawProviderError: event.rawProviderError,
              })),
              agentTraces,
            }
          : {}),
      };
      return response;
    }

    if (pipelineState) {
      const agentTraces = includeAdminDetails
        ? await this.loadAgentTraces(startupId, pipelineState.pipelineRunId)
        : [];
      const totalPhases = Object.keys(pipelineState.phases).length;
      const completedCount = Object.values(pipelineState.phases).filter(
        (phase) => phase.status === "completed",
      ).length;
      const overallProgress =
        totalPhases === 0
          ? 0
          : Math.round((completedCount / totalPhases) * 100);
      const phaseResults = pipelineState.results;

      response.progress = {
        overallProgress,
        currentPhase: pipelineState.currentPhase,
        pipelineStatus: pipelineState.status,
        pipelineRunId: pipelineState.pipelineRunId,
        updatedAt: pipelineState.updatedAt,
        error:
          pipelineState.status === "failed"
            ? (pipelineState.phases[pipelineState.currentPhase]?.error ??
              "Pipeline failed")
            : undefined,
        phasesCompleted: Object.entries(pipelineState.phases)
          .filter(([, phase]) => phase.status === "completed")
          .map(([phase]) => phase),
        phases: Object.fromEntries(
          Object.entries(pipelineState.phases).map(([phase, value]) => [
            phase,
            (() => {
              const phaseIssue = this.derivePhaseIssue(
                phase as PipelinePhase,
                phaseResults[phase as PipelinePhase],
              );
              const shouldExposeIssue =
                value.status === "failed" ||
                value.status === "running" ||
                value.status === "waiting";

              return {
                status: value.status,
                progress:
                  value.status === "completed"
                    ? 100
                    : value.status === "skipped"
                      ? 100
                    : value.status === "running"
                      ? 50
                      : 0,
                startedAt: value.startedAt,
                completedAt: value.completedAt,
                error: shouldExposeIssue ? (value.error ?? phaseIssue) : undefined,
                ...(includeAdminDetails
                  ? {
                      retryCount:
                        pipelineState.retryCounts[phase as PipelinePhase] ?? 0,
                    }
                  : {}),
              };
            })(),
          ]),
        ),
        ...(includeAdminDetails ? { agentTraces } : {}),
      };
      return response;
    }

    if (status === StartupStatus.SUBMITTED || status === StartupStatus.ANALYZING) {
      const [job] = await db
        .select()
        .from(analysisJob)
        .where(eq(analysisJob.startupId, startupId))
        .orderBy(desc(analysisJob.createdAt))
        .limit(1);

      if (job && job.result) {
        const jobResult = job.result as Record<string, unknown>;
        response.progress = {
          overallProgress: (jobResult.overallProgress as number) || 0,
          currentPhase: (jobResult.currentPhase as string) || "queued",
          phasesCompleted: (jobResult.phasesCompleted as string[]) || [],
          phases:
            (jobResult.phases as Record<
              string,
              { status: string; progress: number }
            >) || {},
        };
      }
    }

    return response;
  }

  private async loadAgentTraces(
    startupId: string,
    pipelineRunId?: string,
  ): Promise<
    Array<{
      id: string;
      pipelineRunId: string;
      phase: string;
      agentKey: string;
      status: "running" | "completed" | "failed" | "fallback";
      attempt?: number;
      retryCount?: number;
      usedFallback?: boolean;
      inputPrompt?: string | null;
      outputText?: string | null;
      outputJson?: unknown;
      error?: string | null;
      fallbackReason?:
        | "EMPTY_STRUCTURED_OUTPUT"
        | "TIMEOUT"
        | "SCHEMA_OUTPUT_INVALID"
        | "MODEL_OR_PROVIDER_ERROR"
        | "UNHANDLED_AGENT_EXCEPTION";
      rawProviderError?: string;
      captureStatus?: "captured" | "missing" | "provider_error_only";
      startedAt?: string;
      completedAt?: string | null;
    }>
  > {
    const rows = pipelineRunId
      ? await this.drizzle.db
          .select()
          .from(pipelineAgentRun)
          .where(
            and(
              eq(pipelineAgentRun.startupId, startupId),
              eq(pipelineAgentRun.pipelineRunId, pipelineRunId),
            ),
          )
          .orderBy(desc(pipelineAgentRun.startedAt))
          .limit(200)
      : await this.drizzle.db
          .select()
          .from(pipelineAgentRun)
          .where(eq(pipelineAgentRun.startupId, startupId))
          .orderBy(desc(pipelineAgentRun.startedAt))
          .limit(200);
    if (!Array.isArray(rows)) {
      return [];
    }

    return rows.map((row) => {
      const traceMeta = this.parseTraceMeta(row.outputJson);
      const outputText = row.outputText ?? null;
      const hasOutputText =
        typeof outputText === "string" && outputText.trim().length > 0;
      const hasOutputJson = traceMeta.outputJson !== undefined && traceMeta.outputJson !== null;
      const hasProviderError =
        typeof traceMeta.rawProviderError === "string" &&
        traceMeta.rawProviderError.trim().length > 0;
      const captureStatus = hasOutputText || hasOutputJson
        ? "captured"
        : hasProviderError
          ? "provider_error_only"
          : "missing";

      return {
        ...traceMeta,
        id: row.id,
        pipelineRunId: row.pipelineRunId,
        phase: row.phase,
        agentKey: row.agentKey,
        status: row.status,
        attempt: row.attempt,
        retryCount: row.retryCount,
        usedFallback: row.usedFallback,
        inputPrompt: row.inputPrompt ?? null,
        outputText,
        error: row.error ?? null,
        captureStatus,
        startedAt: row.startedAt ? row.startedAt.toISOString() : undefined,
        completedAt: row.completedAt ? row.completedAt.toISOString() : null,
      };
    });
  }

  private resolvePhaseProgress(
    status: string,
    agents: Record<
      string,
      { status: string; progress?: number | undefined }
    >,
  ): number {
    if (status === "completed" || status === "skipped") {
      return 100;
    }

    const agentValues = Object.values(agents);
    if (!agentValues.length) {
      return status === "running" ? 50 : 0;
    }

    const total = agentValues.reduce((sum, agent) => {
      if (typeof agent.progress === "number") {
        return sum + this.normalizePercent(agent.progress);
      }

      if (agent.status === "completed") {
        return sum + 100;
      }
      if (agent.status === "running") {
        return sum + 50;
      }
      return sum;
    }, 0);

    return this.normalizePercent(Math.round(total / agentValues.length));
  }

  private normalizePercent(value: number): number {
    if (!Number.isFinite(value)) {
      return 0;
    }

    return Math.max(0, Math.min(100, Math.round(value)));
  }

  private isValidPipelinePhase(phase: unknown): phase is PipelinePhase {
    return (
      phase === PipelinePhase.ENRICHMENT ||
      phase === PipelinePhase.EXTRACTION ||
      phase === PipelinePhase.SCRAPING ||
      phase === PipelinePhase.RESEARCH ||
      phase === PipelinePhase.EVALUATION ||
      phase === PipelinePhase.SYNTHESIS
    );
  }

  private isValidRetryAgentRequest(phase: unknown, agent: unknown): boolean {
    if (typeof agent !== "string" || agent.trim().length === 0) {
      return false;
    }

    if (phase === PipelinePhase.RESEARCH) {
      return StartupService.RESEARCH_AGENTS.has(agent as ResearchAgentKey);
    }

    if (phase === PipelinePhase.EVALUATION) {
      return StartupService.EVALUATION_AGENTS.has(agent as EvaluationAgentKey);
    }

    return false;
  }

  private derivePhaseIssue(
    phase: PipelinePhase,
    result: unknown,
  ): string | undefined {
    if (!result || typeof result !== "object") {
      return undefined;
    }

    if (phase === PipelinePhase.EXTRACTION) {
      return this.firstIssueMessage(
        (result as { warnings?: unknown }).warnings,
      );
    }

    if (phase === PipelinePhase.ENRICHMENT) {
      const missingField = this.firstIssueMessage(
        (result as { fieldsStillMissing?: unknown }).fieldsStillMissing,
      );
      return missingField
        ? `Missing after gap fill: ${missingField}`
        : undefined;
    }

    if (phase === PipelinePhase.SCRAPING) {
      return this.firstIssueMessage(
        (result as { scrapeErrors?: unknown }).scrapeErrors,
      );
    }

    if (phase === PipelinePhase.RESEARCH) {
      return this.firstIssueMessage((result as { errors?: unknown }).errors);
    }

    if (phase === PipelinePhase.EVALUATION) {
      return this.firstIssueMessage(
        (result as { summary?: { errors?: unknown } }).summary?.errors,
      );
    }

    return undefined;
  }

  private firstIssueMessage(issues: unknown): string | undefined {
    if (!Array.isArray(issues)) {
      return undefined;
    }

    for (const issue of issues) {
      if (typeof issue === "string" && issue.trim()) {
        return issue.trim();
      }

      if (!issue || typeof issue !== "object") {
        continue;
      }

      const message = (issue as { error?: unknown }).error;
      if (typeof message === "string" && message.trim()) {
        return message.trim();
      }
    }

    return undefined;
  }
}
