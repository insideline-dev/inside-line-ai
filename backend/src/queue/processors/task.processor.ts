import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job } from 'bullmq';
import { QUEUE_NAMES, QUEUE_CONCURRENCY } from '../queue.config';
import { TaskJobData } from '../interfaces/job-data.interface';
import { TaskJobResult } from '../interfaces/job-result.interface';
import { BaseProcessor, parseRedisUrl } from './base.processor';

@Injectable()
export class TaskProcessor
  extends BaseProcessor<TaskJobData, TaskJobResult>
  implements OnModuleInit, OnModuleDestroy
{
  protected readonly logger = new Logger(TaskProcessor.name);

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

  protected async process(
    job: Job<TaskJobData>,
  ): Promise<Omit<TaskJobResult, 'jobId' | 'duration' | 'success'>> {
    this.logger.log(
      `Processing task: ${job.data.name} for user ${job.data.userId}`,
    );

    // Simulate work
    await new Promise((resolve) => setTimeout(resolve, 1000));

    this.logger.log(`Task ${job.data.name} completed`);

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
