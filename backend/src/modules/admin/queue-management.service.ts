import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { QueueService, QUEUE_NAMES, QueueName } from '../../queue';

export interface QueueStatus {
  queues: Array<{
    name: string;
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
  }>;
  totalPending: number;
  totalActive: number;
  totalFailed: number;
}

export interface JobDetails {
  id: string;
  name: string;
  state: string;
  progress: unknown;
  data: unknown;
  result: unknown;
  failedReason?: string;
  attemptsMade: number;
  timestamp: number;
  finishedOn?: number;
}

@Injectable()
export class QueueManagementService {
  private readonly logger = new Logger(QueueManagementService.name);

  constructor(private queueService: QueueService) {}

  async getStatus(): Promise<QueueStatus> {
    const queueNames = Object.values(QUEUE_NAMES);
    const queueStats = await Promise.all(
      queueNames.map(async (name) => {
        const queue = this.queueService.getQueue(name);
        if (!queue) {
          return {
            name,
            waiting: 0,
            active: 0,
            completed: 0,
            failed: 0,
            delayed: 0,
          };
        }

        const counts = await queue.getJobCounts(
          'waiting',
          'active',
          'completed',
          'failed',
          'delayed',
        );

        return {
          name,
          waiting: counts.waiting || 0,
          active: counts.active || 0,
          completed: counts.completed || 0,
          failed: counts.failed || 0,
          delayed: counts.delayed || 0,
        };
      }),
    );

    const totals = queueStats.reduce(
      (acc, q) => ({
        totalPending: acc.totalPending + q.waiting + q.delayed,
        totalActive: acc.totalActive + q.active,
        totalFailed: acc.totalFailed + q.failed,
      }),
      { totalPending: 0, totalActive: 0, totalFailed: 0 },
    );

    return {
      queues: queueStats,
      ...totals,
    };
  }

  async getFailedJobs(queueName: QueueName, limit = 20): Promise<JobDetails[]> {
    const queue = this.queueService.getQueue(queueName);
    if (!queue) {
      throw new NotFoundException(`Queue ${queueName} not found`);
    }

    const jobs = await queue.getJobs(['failed'], 0, limit - 1);

    return Promise.all(
      jobs.map(async (job) => ({
        id: job.id!,
        name: job.name,
        state: await job.getState(),
        progress: job.progress,
        data: job.data,
        result: job.returnvalue,
        failedReason: job.failedReason,
        attemptsMade: job.attemptsMade,
        timestamp: job.timestamp,
        finishedOn: job.finishedOn,
      })),
    );
  }

  async retryJob(queueName: QueueName, jobId: string): Promise<{ success: boolean; message: string }> {
    const queue = this.queueService.getQueue(queueName);
    if (!queue) {
      throw new NotFoundException(`Queue ${queueName} not found`);
    }

    const job = await queue.getJob(jobId);
    if (!job) {
      throw new NotFoundException(`Job ${jobId} not found`);
    }

    const state = await job.getState();
    if (state !== 'failed') {
      return {
        success: false,
        message: `Job is not in failed state (current: ${state})`,
      };
    }

    await job.retry();

    this.logger.log(`Retried job ${jobId} in queue ${queueName}`);

    return {
      success: true,
      message: `Job ${jobId} has been retried`,
    };
  }

  async cleanQueue(
    queueName: QueueName,
    status: 'completed' | 'failed',
    olderThanMs = 3600000,
  ): Promise<{ cleaned: number }> {
    const queue = this.queueService.getQueue(queueName);
    if (!queue) {
      throw new NotFoundException(`Queue ${queueName} not found`);
    }

    const cleaned = await queue.clean(olderThanMs, 1000, status);

    this.logger.log(
      `Cleaned ${cleaned.length} ${status} jobs from queue ${queueName}`,
    );

    return { cleaned: cleaned.length };
  }
}
