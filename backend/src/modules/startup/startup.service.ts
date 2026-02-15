import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from "@nestjs/common";
import { eq, and, or, ilike, sql, desc } from "drizzle-orm";
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
  private static readonly RESEARCH_AGENTS = new Set<
    ResearchAgentKey
  >(["team", "market", "product", "news"]);
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
  ) {}

  private generateSlug(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  async create(userId: string, dto: CreateStartup) {
    return this.drizzle.withRLS(userId, async (db) => {
      const slug = this.generateSlug(dto.name);
      const geography = deriveStartupGeography(dto.location);

      const [created] = await db
        .insert(startup)
        .values({
          userId,
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

  async approve(id: string, adminId: string) {
    const [found] = await this.drizzle.db
      .select()
      .from(startup)
      .where(eq(startup.id, id))
      .limit(1);

    if (!found) {
      throw new NotFoundException(`Startup with ID ${id} not found`);
    }

    if (found.status !== StartupStatus.SUBMITTED) {
      throw new BadRequestException("Can only approve submitted startups");
    }

    const [updated] = await this.drizzle.db
      .update(startup)
      .set({
        status: StartupStatus.APPROVED,
        approvedAt: new Date(),
      })
      .where(eq(startup.id, id))
      .returning();

    await this.queue.addJob(
      QUEUE_NAMES.TASK,
      {
        type: "task",
        userId: adminId,
        name: "match-startup",
        priority: 2,
        payload: { startupId: id },
      },
      { priority: 2 },
    );

    this.logger.log(`Approved startup ${id} by admin ${adminId}`);
    return updated;
  }

  async reject(id: string, adminId: string, rejectionReason: string) {
    const [found] = await this.drizzle.db
      .select()
      .from(startup)
      .where(eq(startup.id, id))
      .limit(1);

    if (!found) {
      throw new NotFoundException(`Startup with ID ${id} not found`);
    }

    if (found.status !== StartupStatus.SUBMITTED) {
      throw new BadRequestException("Can only reject submitted startups");
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

    this.logger.log(`Rejected startup ${id} by admin ${adminId}`);
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

    await this.aiPipeline.retryAgent(id, {
      phase: request.phase,
      agentKey: request.agent as ResearchAgentKey | EvaluationAgentKey,
    });

    this.logger.log(
      `Admin ${adminId} requested agent retry for startup ${id}, phase ${request.phase}, agent ${request.agent}`,
    );

    return {
      startupId: id,
      phase: request.phase,
      agent: request.agent,
      accepted: true,
      feedbackAccepted: Boolean(feedback),
      mode: "agent_retry",
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

    return {
      jobs: [],
      message: "Job tracking not implemented yet",
    };
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

      return this.buildProgressResponse(db, id, found.status);
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

    return this.buildProgressResponse(this.drizzle.db, id, found.status);
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
    const rawSources = Array.isArray(evaluation.sources) ? evaluation.sources : [];
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
      return evaluation;
    }

    return {
      ...evaluation,
      sources: [...baseSources, ...missingModelSources],
    };
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

  private async buildProgressResponse(
    db: DrizzleService["db"],
    startupId: string,
    status: StartupStatus,
  ): Promise<GetProgressResponse> {
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
              Object.entries(value.agents ?? {}).map(([agentKey, agent]) => [
                agentKey,
                {
                  key: agent.key,
                  status: agent.status,
                  progress:
                    typeof agent.progress === "number"
                      ? this.normalizePercent(agent.progress)
                      : undefined,
                  startedAt: agent.startedAt,
                  completedAt: agent.completedAt,
                  error: agent.error,
                },
              ]),
            );

            return [
              phase,
              {
                status: value.status,
                progress: this.resolvePhaseProgress(value.status, agents),
                startedAt: value.startedAt,
                completedAt: value.completedAt,
                error: shouldExposeIssue
                  ? (value.error ?? phaseIssue)
                  : undefined,
                agents: Object.keys(agents).length > 0 ? agents : undefined,
              },
            ];
          }),
        ),
      };
      return response;
    }

    if (pipelineState) {
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
              };
            })(),
          ]),
        ),
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
