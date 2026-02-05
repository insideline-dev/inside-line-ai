import { Injectable, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue, QueueEvents, ConnectionOptions } from 'bullmq';
import {
  QUEUE_NAMES,
  DEFAULT_JOB_OPTIONS,
  QUEUE_DEPTH_LIMITS,
  QueueName,
} from './queue.config';
import type { JobData, JobResult } from './interfaces';

export interface QueueDepthInfo {
  waiting: number;
  active: number;
  total: number;
  maxDepth: number;
  maxPerUser: number;
}

@Injectable()
export class QueueService implements OnModuleDestroy {
  private readonly logger = new Logger(QueueService.name);
  private queues: Map<QueueName, Queue> = new Map();
  private queueEvents: Map<QueueName, QueueEvents> = new Map();

  constructor(private config: ConfigService) {
    this.initializeQueues();
  }

  get redisConnection(): ConnectionOptions {
    const redisUrl = this.config.get<string>('REDIS_URL');

    if (redisUrl) {
      // Parse REDIS_URL (e.g., redis://localhost:6379 or redis://user:pass@host:port)
      try {
        const url = new URL(redisUrl);
        return {
          host: url.hostname,
          port: parseInt(url.port || '6379', 10),
          password: url.password || undefined,
          username: url.username || undefined,
          tls: url.protocol === 'rediss:' ? {} : undefined,
        };
      } catch (error) {
        this.logger.error(`Failed to parse REDIS_URL: ${error}`);
      }
    }

    // Fallback to individual env vars (legacy)
    return {
      host: this.config.get('REDIS_HOST', 'localhost'),
      port: this.config.get('REDIS_PORT', 6379),
      password: this.config.get('REDIS_PASSWORD'),
      tls: this.config.get('REDIS_TLS') ? {} : undefined,
    };
  }

  private initializeQueues() {
    Object.values(QUEUE_NAMES).forEach((name) => {
      const queue = new Queue(name, {
        connection: this.redisConnection,
        defaultJobOptions: DEFAULT_JOB_OPTIONS,
      });
      this.queues.set(name, queue);

      const events = new QueueEvents(name, {
        connection: this.redisConnection,
      });
      this.queueEvents.set(name, events);

      this.logger.log(`Initialized queue: ${name}`);
    });
  }

  /**
   * Add a job to the specified queue
   */
  async addJob<T extends JobData>(
    queueName: QueueName,
    data: T,
    options?: { priority?: number; delay?: number; jobId?: string },
  ): Promise<string> {
    const queue = this.queues.get(queueName);
    if (!queue) throw new Error(`Queue ${queueName} not found`);

    const job = await queue.add(data.type, data, {
      priority: options?.priority ?? data.priority,
      delay: options?.delay,
      jobId: options?.jobId,
    });

    this.logger.debug(`Added job ${job.id} to queue ${queueName}`);
    return job.id!;
  }

  /**
   * Get the status of a job
   */
  async getJobStatus(queueName: QueueName, jobId: string) {
    const queue = this.queues.get(queueName);
    if (!queue) throw new Error(`Queue ${queueName} not found`);

    const job = await queue.getJob(jobId);
    if (!job) return null;

    const state = await job.getState();
    return {
      id: job.id,
      state,
      progress: job.progress,
      data: job.data,
      result: job.returnvalue,
      failedReason: job.failedReason,
      attemptsMade: job.attemptsMade,
      timestamp: job.timestamp,
      finishedOn: job.finishedOn,
    };
  }

  /**
   * Wait for a job to complete (useful for sync-style APIs)
   */
  async waitForJob<T extends JobResult>(
    queueName: QueueName,
    jobId: string,
    timeout = 300000, // 5 minutes default
  ): Promise<T> {
    const events = this.queueEvents.get(queueName);
    if (!events) throw new Error(`Queue events ${queueName} not found`);

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Job ${jobId} timed out after ${timeout}ms`));
      }, timeout);

      const completedHandler = ({
        jobId: completedId,
        returnvalue,
      }: {
        jobId: string;
        returnvalue: string;
      }) => {
        if (completedId === jobId) {
          clearTimeout(timer);
          events.off('completed', completedHandler);
          events.off('failed', failedHandler);
          resolve(JSON.parse(returnvalue) as T);
        }
      };

      const failedHandler = ({
        jobId: failedId,
        failedReason,
      }: {
        jobId: string;
        failedReason: string;
      }) => {
        if (failedId === jobId) {
          clearTimeout(timer);
          events.off('completed', completedHandler);
          events.off('failed', failedHandler);
          reject(new Error(failedReason));
        }
      };

      events.on('completed', completedHandler);
      events.on('failed', failedHandler);
    });
  }

  /**
   * Get a queue instance by name
   */
  getQueue(name: QueueName): Queue | undefined {
    return this.queues.get(name);
  }

  /**
   * Get queue events instance by name
   */
  getQueueEvents(name: QueueName): QueueEvents | undefined {
    return this.queueEvents.get(name);
  }

  /**
   * Check Redis connection health
   */
  async checkHealth(): Promise<{ status: 'ok' | 'error'; latency?: number }> {
    try {
      const queue = this.queues.get(QUEUE_NAMES.TASK);
      if (!queue) return { status: 'error' };

      const start = Date.now();
      const client = await queue.client;
      await client.ping();
      const latency = Date.now() - start;

      return { status: 'ok', latency };
    } catch {
      return { status: 'error' };
    }
  }

  /**
   * Get queue depth info for backpressure checks
   */
  async getQueueDepth(queueName: QueueName): Promise<QueueDepthInfo> {
    const queue = this.queues.get(queueName);
    if (!queue) throw new Error(`Queue ${queueName} not found`);

    const counts = await queue.getJobCounts('waiting', 'active');
    const limits = QUEUE_DEPTH_LIMITS[queueName];

    const depth: QueueDepthInfo = {
      waiting: counts.waiting,
      active: counts.active,
      total: counts.waiting + counts.active,
      maxDepth: limits.maxDepth,
      maxPerUser: limits.maxPerUser,
    };

    // Log warning if queue is getting full (>80%)
    const utilizationPct = (depth.total / depth.maxDepth) * 100;
    if (utilizationPct >= 80) {
      this.logger.warn(
        `Queue ${queueName} at ${utilizationPct.toFixed(1)}% capacity (${depth.total}/${depth.maxDepth})`,
      );
    }

    return depth;
  }

  /**
   * Count jobs for a specific user in a queue (waiting + active)
   */
  async getUserJobCount(queueName: QueueName, userId: string): Promise<number> {
    const queue = this.queues.get(queueName);
    if (!queue) throw new Error(`Queue ${queueName} not found`);

    // Get waiting and active jobs
    const [waiting, active] = await Promise.all([
      queue.getJobs(['waiting']),
      queue.getJobs(['active']),
    ]);

    // Count jobs belonging to this user
    const userJobs = [...waiting, ...active].filter(
      (job) => job.data?.userId === userId,
    );

    return userJobs.length;
  }

  async onModuleDestroy() {
    this.logger.log('Closing queue connections...');

    for (const queue of this.queues.values()) {
      await queue.close();
    }
    for (const events of this.queueEvents.values()) {
      await events.close();
    }

    this.logger.log('Queue connections closed');
  }
}
