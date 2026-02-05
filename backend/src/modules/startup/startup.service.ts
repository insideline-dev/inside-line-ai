import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { eq, and, or, ilike, sql, desc } from 'drizzle-orm';
import { DrizzleService } from '../../database';
import { QueueService, QUEUE_NAMES } from '../../queue';
import { StorageService } from '../../storage';
import {
  startup,
  StartupStatus,
} from './entities/startup.schema';
import {
  CreateStartup,
  UpdateStartup,
  GetStartupsQuery,
  GetApprovedStartupsQuery,
  PresignedUrl,
  GetProgressResponse,
} from './dto';
import { DraftService } from './draft.service';
import { analysisJob, startupEvaluation } from '../analysis/entities/analysis.schema';

@Injectable()
export class StartupService {
  private readonly logger = new Logger(StartupService.name);

  constructor(
    private drizzle: DrizzleService,
    private queue: QueueService,
    private storage: StorageService,
    private draftService: DraftService,
  ) {}

  private generateSlug(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
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
        conditions.push(
          or(
            ilike(startup.name, `%${search}%`),
            ilike(startup.tagline, `%${search}%`),
            ilike(startup.description, `%${search}%`),
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

      return found;
    });
  }

  async update(id: string, userId: string, dto: UpdateStartup) {
    return this.drizzle.withRLS(userId, async (db) => {
      const existing = await this.findOne(id, userId);

      if (
        existing.status === StartupStatus.SUBMITTED ||
        existing.status === StartupStatus.APPROVED
      ) {
        throw new ForbiddenException(
          'Cannot edit startup while submitted or approved',
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
        throw new ForbiddenException('Can only delete draft startups');
      }

      await db.delete(startup).where(eq(startup.id, id));

      this.logger.log(`Deleted startup ${id}`);
    });
  }

  async submit(id: string, userId: string) {
    return this.drizzle.withRLS(userId, async (db) => {
      const existing = await this.findOne(id, userId);

      if (existing.status !== StartupStatus.DRAFT) {
        throw new BadRequestException('Can only submit draft startups');
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

      await this.queue.addJob(
        QUEUE_NAMES.TASK,
        {
          type: 'task',
          userId,
          name: 'score-startup',
          priority: 1,
          payload: { startupId: id },
        },
        { priority: 1 },
      );

      this.logger.log(`Submitted startup ${id} for review`);
      return updated;
    });
  }

  async resubmit(id: string, userId: string) {
    return this.drizzle.withRLS(userId, async (db) => {
      const existing = await this.findOne(id, userId);

      if (existing.status !== StartupStatus.REJECTED) {
        throw new BadRequestException('Can only resubmit rejected startups');
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

      await this.queue.addJob(
        QUEUE_NAMES.TASK,
        {
          type: 'task',
          userId,
          name: 'score-startup',
          priority: 1,
          payload: { startupId: id },
        },
        { priority: 1 },
      );

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
      throw new BadRequestException('Can only approve submitted startups');
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
        type: 'task',
        userId: adminId,
        name: 'match-startup',
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
      throw new BadRequestException('Can only reject submitted startups');
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

    const jobId = await this.queue.addJob(
      QUEUE_NAMES.TASK,
      {
        type: 'task',
        userId: adminId,
        name: 'reanalyze-startup',
        priority: 3,
        payload: { startupId: id },
      },
      { priority: 3 },
    );

    this.logger.log(`Queued reanalysis for startup ${id}`);
    return { jobId };
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
      conditions.push(
        or(
          ilike(startup.name, `%${search}%`),
          ilike(startup.tagline, `%${search}%`),
          ilike(startup.description, `%${search}%`),
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
      conditions.push(ilike(startup.location, `%${location}%`));
    }
    if (search) {
      conditions.push(
        or(
          ilike(startup.name, `%${search}%`),
          ilike(startup.tagline, `%${search}%`),
          ilike(startup.description, `%${search}%`),
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
      .where(and(eq(startup.id, id), eq(startup.status, StartupStatus.APPROVED)))
      .limit(1);

    if (!found) {
      throw new NotFoundException('Approved startup not found');
    }

    return found;
  }

  async findBySlug(slug: string) {
    const [found] = await this.drizzle.db
      .select()
      .from(startup)
      .where(and(eq(startup.slug, slug), eq(startup.status, StartupStatus.APPROVED)))
      .limit(1);

    if (!found) {
      throw new NotFoundException('Startup not found');
    }

    return found;
  }

  async getUploadUrl(
    id: string,
    userId: string,
    dto: PresignedUrl,
  ) {
    await this.findOne(id, userId);

    const assetType = dto.fileType.startsWith('application/')
      ? 'pitch-deck'
      : 'startup-assets';

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
      message: 'Job tracking not implemented yet',
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

      const response: GetProgressResponse = {
        status: found.status,
        progress: null,
      };

      if (found.status === StartupStatus.SUBMITTED || found.status === 'analyzing' as any) {
        const [job] = await db
          .select()
          .from(analysisJob)
          .where(eq(analysisJob.startupId, id))
          .orderBy(desc(analysisJob.createdAt))
          .limit(1);

        if (job && job.result) {
          const jobResult = job.result as Record<string, unknown>;
          response.progress = {
            overallProgress:
              (jobResult.overallProgress as number) || 0,
            currentPhase: (jobResult.currentPhase as string) || 'queued',
            phasesCompleted: (jobResult.phasesCompleted as string[]) || [],
            phases: (jobResult.phases as Record<string, { status: string; progress: number }>) || {},
          };
        }
      }

      return response;
    });
  }

  async getEvaluation(startupId: string) {
    const [evaluation] = await this.drizzle.db
      .select()
      .from(startupEvaluation)
      .where(eq(startupEvaluation.startupId, startupId))
      .limit(1);

    if (!evaluation) {
      throw new NotFoundException('Evaluation not found');
    }

    return evaluation;
  }
}
