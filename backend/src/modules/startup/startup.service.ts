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
import { PipelinePhase } from "../ai/interfaces/pipeline.interface";
import { PipelineFeedbackService } from "../ai/services/pipeline-feedback.service";
import { startup, StartupStatus } from "./entities/startup.schema";
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

      const [created] = await db
        .insert(startup)
        .values({
          userId,
          slug,
          ...dto,
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

      const [updated] = await db
        .update(startup)
        .set({
          ...dto,
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

    const [updated] = await this.drizzle.db
      .update(startup)
      .set({
        ...dto,
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

    await this.drizzle.db.delete(startup).where(eq(startup.id, id));

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

    return evaluation;
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
      evaluation,
    };
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

    const pipelineState = await this.aiPipeline.getPipelineStatus(startupId);
    if (pipelineState) {
      const totalPhases = Object.keys(pipelineState.phases).length;
      const completedCount = Object.values(pipelineState.phases).filter(
        (phase) => phase.status === "completed",
      ).length;
      const overallProgress =
        totalPhases === 0
          ? 0
          : Math.round((completedCount / totalPhases) * 100);

      response.progress = {
        overallProgress,
        currentPhase: pipelineState.currentPhase,
        phasesCompleted: Object.entries(pipelineState.phases)
          .filter(([, phase]) => phase.status === "completed")
          .map(([phase]) => phase),
        phases: Object.fromEntries(
          Object.entries(pipelineState.phases).map(([phase, value]) => [
            phase,
            {
              status: value.status,
              progress:
                value.status === "completed"
                  ? 100
                  : value.status === "running"
                    ? 50
                    : 0,
            },
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
}
