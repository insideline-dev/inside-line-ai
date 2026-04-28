import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job } from 'bullmq';
import { QUEUE_NAMES, QUEUE_CONCURRENCY } from '../queue.config';
import { TaskJobData } from '../interfaces/job-data.interface';
import { TaskJobResult } from '../interfaces/job-result.interface';
import { BaseProcessor, parseRedisUrl } from './base.processor';

export type TaskJobHandlerResult = Omit<
  TaskJobResult,
  'jobId' | 'duration' | 'success'
>;

export type TaskJobHandler = (
  job: Job<TaskJobData>,
) => Promise<TaskJobHandlerResult>;

/**
 * Single worker on QUEUE_NAMES.TASK that routes jobs to handlers by job-name.
 * Other modules call `registerHandler(jobName, fn)` from their own onModuleInit
 * so the TASK queue stays a shared bus without spawning competing workers.
 */
@Injectable()
export class TaskProcessor
  extends BaseProcessor<TaskJobData, TaskJobResult>
  implements OnModuleInit, OnModuleDestroy
{
  protected readonly logger = new Logger(TaskProcessor.name);
  private readonly handlers = new Map<string, TaskJobHandler>();

  constructor(private config: ConfigService) {
    const redisUrl = config.get<string>('REDIS_URL', 'redis://localhost:6379');
    const queuePrefix = config.get<string>('QUEUE_PREFIX');
    super(
      QUEUE_NAMES.TASK,
      parseRedisUrl(redisUrl),
      QUEUE_CONCURRENCY[QUEUE_NAMES.TASK],
      queuePrefix,
    );
  }

  async onModuleDestroy() {
    await this.close();
  }

  onModuleInit() {
    this.initialize();
  }

  registerHandler(jobName: string, handler: TaskJobHandler): void {
    if (this.handlers.has(jobName)) {
      this.logger.warn(`Overwriting existing TASK handler for ${jobName}`);
    }
    this.handlers.set(jobName, handler);
    this.logger.log(`Registered TASK handler for ${jobName}`);
  }

  protected async process(
    job: Job<TaskJobData>,
  ): Promise<TaskJobHandlerResult> {
    const handler = this.handlers.get(job.name);
    if (handler) {
      this.logger.log(
        `Routing task ${job.name} (job ${job.id}) for user ${job.data.userId}`,
      );
      return handler(job);
    }

    // Fallback: legacy generic task — ack with metadata, no real work.
    this.logger.log(
      `Processing generic task: ${job.data.name} for user ${job.data.userId}`,
    );
    return {
      type: 'task',
      result: {
        taskName: job.data.name,
        payload: job.data.payload,
        processedAt: new Date().toISOString(),
      },
    };
  }
}
