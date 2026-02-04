import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job } from 'bullmq';
import { QUEUE_NAMES, QUEUE_CONCURRENCY } from '../queue.config';
import { TaskJobData } from '../interfaces/job-data.interface';
import { TaskJobResult } from '../interfaces/job-result.interface';
import { BaseProcessor } from './base.processor';

@Injectable()
export class TaskProcessor
  extends BaseProcessor<TaskJobData, TaskJobResult>
  implements OnModuleInit
{
  protected readonly logger = new Logger(TaskProcessor.name);

  constructor(private config: ConfigService) {
    super(
      QUEUE_NAMES.TASK,
      {
        host: config.get('REDIS_HOST'),
        port: config.get('REDIS_PORT'),
        password: config.get('REDIS_PASSWORD'),
        tls: config.get('REDIS_TLS') ? {} : undefined,
      },
      QUEUE_CONCURRENCY[QUEUE_NAMES.TASK],
    );
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
