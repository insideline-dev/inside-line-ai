import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { eq, and, desc, sql } from 'drizzle-orm';
import { DrizzleService } from '../../database';
import { QueueService } from '../../queue';
import { ANALYSIS_QUEUE_NAME, ANALYSIS_JOB_PRIORITIES } from './analysis.config';
import {
  analysisJob,
  AnalysisJobType,
  AnalysisJobStatus,
  AnalysisJobPriority,
  AnalysisJob,
} from './entities';
import { GetJobsQueryDto } from './dto';
import type {
  ScoringJobData,
  MatchingJobData,
  PdfJobData,
  MarketAnalysisJobData,
} from './interfaces';

export interface PaginatedJobs {
  data: AnalysisJob[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

@Injectable()
export class AnalysisService {
  private readonly logger = new Logger(AnalysisService.name);

  constructor(
    private drizzle: DrizzleService,
    private queue: QueueService,
  ) {}

  async queueScoringJob(startupId: string, userId: string): Promise<string> {
    const jobRecord = await this.createJobRecord(
      AnalysisJobType.SCORING,
      startupId,
      AnalysisJobPriority.HIGH,
    );

    const jobData: ScoringJobData = {
      type: 'scoring',
      startupId,
      analysisJobId: jobRecord.id,
      userId,
      priority: ANALYSIS_JOB_PRIORITIES.high,
    };

    await this.queue.addJob(ANALYSIS_QUEUE_NAME, jobData, {
      priority: ANALYSIS_JOB_PRIORITIES.high,
    });

    this.logger.log(`Queued scoring job ${jobRecord.id} for startup ${startupId}`);
    return jobRecord.id;
  }

  async queueMatchingJob(startupId: string, userId: string): Promise<string> {
    const jobRecord = await this.createJobRecord(
      AnalysisJobType.MATCHING,
      startupId,
      AnalysisJobPriority.MEDIUM,
    );

    const jobData: MatchingJobData = {
      type: 'matching',
      startupId,
      analysisJobId: jobRecord.id,
      userId,
      priority: ANALYSIS_JOB_PRIORITIES.medium,
    };

    await this.queue.addJob(ANALYSIS_QUEUE_NAME, jobData, {
      priority: ANALYSIS_JOB_PRIORITIES.medium,
    });

    this.logger.log(`Queued matching job ${jobRecord.id} for startup ${startupId}`);
    return jobRecord.id;
  }

  async queuePdfJob(
    startupId: string,
    userId: string,
    requestedBy: string,
  ): Promise<string> {
    const jobRecord = await this.createJobRecord(
      AnalysisJobType.PDF,
      startupId,
      AnalysisJobPriority.HIGH,
    );

    const jobData: PdfJobData = {
      type: 'pdf',
      startupId,
      analysisJobId: jobRecord.id,
      userId,
      requestedBy,
      priority: ANALYSIS_JOB_PRIORITIES.high,
    };

    await this.queue.addJob(ANALYSIS_QUEUE_NAME, jobData, {
      priority: ANALYSIS_JOB_PRIORITIES.high,
    });

    this.logger.log(`Queued PDF job ${jobRecord.id} for startup ${startupId}`);
    return jobRecord.id;
  }

  async queueMarketAnalysisJob(startupId: string, userId: string): Promise<string> {
    const jobRecord = await this.createJobRecord(
      AnalysisJobType.MARKET_ANALYSIS,
      startupId,
      AnalysisJobPriority.LOW,
    );

    const jobData: MarketAnalysisJobData = {
      type: 'market_analysis',
      startupId,
      analysisJobId: jobRecord.id,
      userId,
      priority: ANALYSIS_JOB_PRIORITIES.low,
    };

    await this.queue.addJob(ANALYSIS_QUEUE_NAME, jobData, {
      priority: ANALYSIS_JOB_PRIORITIES.low,
    });

    this.logger.log(`Queued market analysis job ${jobRecord.id} for startup ${startupId}`);
    return jobRecord.id;
  }

  async getJobsForStartup(
    startupId: string,
    query: GetJobsQueryDto,
  ): Promise<PaginatedJobs> {
    const { page, limit, jobType, status } = query;
    const offset = (page - 1) * limit;

    const conditions = [eq(analysisJob.startupId, startupId)];

    if (jobType) {
      conditions.push(eq(analysisJob.jobType, jobType));
    }
    if (status) {
      conditions.push(eq(analysisJob.status, status));
    }

    const whereClause = and(...conditions);

    const [items, [{ count }]] = await Promise.all([
      this.drizzle.db
        .select()
        .from(analysisJob)
        .where(whereClause)
        .orderBy(desc(analysisJob.createdAt))
        .limit(limit)
        .offset(offset),
      this.drizzle.db
        .select({ count: sql<number>`count(*)::int` })
        .from(analysisJob)
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

  async getJob(jobId: string): Promise<AnalysisJob> {
    const [job] = await this.drizzle.db
      .select()
      .from(analysisJob)
      .where(eq(analysisJob.id, jobId))
      .limit(1);

    if (!job) {
      throw new NotFoundException(`Job ${jobId} not found`);
    }

    return job;
  }

  async retryJob(jobId: string, userId: string): Promise<string> {
    const job = await this.getJob(jobId);

    if (job.status !== AnalysisJobStatus.FAILED) {
      throw new Error('Only failed jobs can be retried');
    }

    switch (job.jobType) {
      case AnalysisJobType.SCORING:
        return this.queueScoringJob(job.startupId, userId);
      case AnalysisJobType.MATCHING:
        return this.queueMatchingJob(job.startupId, userId);
      case AnalysisJobType.PDF:
        return this.queuePdfJob(job.startupId, userId, userId);
      case AnalysisJobType.MARKET_ANALYSIS:
        return this.queueMarketAnalysisJob(job.startupId, userId);
      default:
        throw new Error(`Unknown job type: ${job.jobType}`);
    }
  }

  async getLatestScoringJob(startupId: string): Promise<AnalysisJob | null> {
    const [job] = await this.drizzle.db
      .select()
      .from(analysisJob)
      .where(
        and(
          eq(analysisJob.startupId, startupId),
          eq(analysisJob.jobType, AnalysisJobType.SCORING),
          eq(analysisJob.status, AnalysisJobStatus.COMPLETED),
        ),
      )
      .orderBy(desc(analysisJob.completedAt))
      .limit(1);

    return job ?? null;
  }

  async createJobRecord(
    jobType: AnalysisJobType,
    startupId: string,
    priority: AnalysisJobPriority,
  ): Promise<AnalysisJob> {
    const [job] = await this.drizzle.db
      .insert(analysisJob)
      .values({
        startupId,
        jobType,
        priority,
        status: AnalysisJobStatus.PENDING,
      })
      .returning();

    return job;
  }

  async updateJobStatus(
    jobId: string,
    status: AnalysisJobStatus,
    result?: Record<string, unknown>,
    errorMessage?: string,
  ): Promise<AnalysisJob> {
    const updateData: Partial<AnalysisJob> = { status };

    if (status === AnalysisJobStatus.PROCESSING) {
      updateData.startedAt = new Date();
    }

    if (status === AnalysisJobStatus.COMPLETED) {
      updateData.completedAt = new Date();
      if (result) {
        updateData.result = result;
      }
    }

    if (status === AnalysisJobStatus.FAILED) {
      updateData.completedAt = new Date();
      if (errorMessage) {
        updateData.errorMessage = errorMessage;
      }
    }

    const [updated] = await this.drizzle.db
      .update(analysisJob)
      .set(updateData)
      .where(eq(analysisJob.id, jobId))
      .returning();

    if (!updated) {
      throw new NotFoundException(`Job ${jobId} not found`);
    }

    this.logger.log(`Updated job ${jobId} status to ${status}`);
    return updated;
  }
}
