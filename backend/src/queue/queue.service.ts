import { Injectable, OnModuleDestroy, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Queue, QueueEvents, ConnectionOptions } from "bullmq";
import Redis, { type RedisOptions } from "ioredis";
import {
  QUEUE_NAMES,
  DEFAULT_JOB_OPTIONS,
  resolveQueueDepthLimits,
  type QueueDepthLimits,
  QueueName,
} from "./queue.config";
import type { JobData, JobResult } from "./interfaces";
import { buildBullRedisConnection } from "./redis-connection.util";

const TRANSIENT_REDIS_WARN_WINDOW_MS = 30_000;
const TRANSIENT_REDIS_ERROR_PATTERNS = [
  "connection is closed",
  "connection closed",
  "econnreset",
  "econnrefused",
  "etimedout",
  "socket hang up",
];

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
  private readonly queueDepthLimits: QueueDepthLimits;
  private readonly redisConnectionOptions: ConnectionOptions;
  private readonly queueConnection: Redis;
  private readonly queuePrefix?: string;
  private readonly transientWarnTimestamps = new Map<string, number>();

  constructor(private config: ConfigService) {
    this.queueDepthLimits = resolveQueueDepthLimits((key, defaultValue) =>
      this.config.get<number>(key, defaultValue),
    );
    this.queuePrefix = this.resolveQueuePrefix();
    this.redisConnectionOptions = this.resolveRedisConnection();
    this.queueConnection = this.createQueueConnection();
    this.initializeQueues();
  }

  get redisConnection(): ConnectionOptions {
    return this.redisConnectionOptions;
  }

  private resolveRedisConnection(): ConnectionOptions {
    return buildBullRedisConnection(this.config.get<string>("REDIS_URL"), {
      host: this.config.get<string>("REDIS_HOST", "localhost"),
      port: this.config.get<number>("REDIS_PORT", 6379),
      username: this.config.get<string>("REDIS_USERNAME"),
      password: this.config.get<string>("REDIS_PASSWORD"),
      tls: Boolean(this.config.get<boolean>("REDIS_TLS")),
    });
  }

  private createQueueConnection(): Redis {
    const client = new Redis(this.redisConnectionOptions as RedisOptions);
    client.on("error", (error) => {
      const message = String(error);
      const logMessage = `Queue Redis connection error: ${message}`;
      if (this.isTransientRedisError(message)) {
        this.warnThrottled(
          "queue-connection",
          logMessage,
          TRANSIENT_REDIS_WARN_WINDOW_MS,
        );
        return;
      }
      this.logger.warn(logMessage);
    });
    return client;
  }

  private resolveQueuePrefix(): string | undefined {
    const value = this.config.get<string>("QUEUE_PREFIX");
    const trimmed = value?.trim();
    return trimmed ? trimmed : undefined;
  }

  private initializeQueues() {
    Object.values(QUEUE_NAMES).forEach((name) => {
      const queue = new Queue(name, {
        connection: this.redisConnectionOptions,
        ...(this.queuePrefix ? { prefix: this.queuePrefix } : {}),
        defaultJobOptions: DEFAULT_JOB_OPTIONS,
      });
      const queueWithEvents = queue as unknown as {
        on?: (event: string, handler: (error: unknown) => void) => void;
      };
      if (typeof queueWithEvents.on === "function") {
        queueWithEvents.on("error", (error) => {
          const message = String(error);
          const logMessage = `Queue ${name} error: ${message}`;
          if (this.isTransientRedisError(message)) {
            this.warnThrottled(
              `queue:${name}`,
              logMessage,
              TRANSIENT_REDIS_WARN_WINDOW_MS,
            );
            return;
          }
          this.logger.warn(logMessage);
        });
      }
      this.queues.set(name, queue);

      this.logger.log(`Initialized queue: ${name}`);
    });
  }

  /**
   * Add a job to the specified queue
   */
  async addJob<T extends JobData>(
    queueName: QueueName,
    data: T,
    options?: { priority?: number; delay?: number; jobId?: string; attempts?: number },
  ): Promise<string> {
    const queue = this.queues.get(queueName);
    if (!queue) throw new Error(`Queue ${queueName} not found`);

    const job = await queue.add(data.type, data, {
      priority: options?.priority ?? data.priority,
      delay: options?.delay,
      jobId: options?.jobId,
      attempts: options?.attempts,
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
    const events = await this.getOrCreateQueueEvents(queueName);

    return new Promise((resolve, reject) => {
      let cleaned = false;

      const cleanup = () => {
        if (cleaned) return;
        cleaned = true;
        clearTimeout(timer);
        events.off('completed', completedHandler);
        events.off('failed', failedHandler);
      };

      const timer = setTimeout(() => {
        cleanup();
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
          cleanup();
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
          cleanup();
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
      const start = Date.now();
      await this.queueConnection.ping();
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
    const limits = this.queueDepthLimits[queueName];

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

  /**
   * Remove all pending AI pipeline jobs for a startup.
   * Active jobs are intentionally left untouched because BullMQ cannot safely
   * remove an actively running job from a separate worker process.
   */
  async removePipelineJobs(startupId: string): Promise<number> {
    const aiQueues: QueueName[] = [
      QUEUE_NAMES.AI_EXTRACTION,
      QUEUE_NAMES.AI_ENRICHMENT,
      QUEUE_NAMES.AI_SCRAPING,
      QUEUE_NAMES.AI_RESEARCH,
      QUEUE_NAMES.AI_EVALUATION,
      QUEUE_NAMES.AI_SYNTHESIS,
      QUEUE_NAMES.AI_MATCHING,
    ];

    let removed = 0;
    for (const queueName of aiQueues) {
      removed += await this.removePendingJobsByStartup(queueName, startupId);
    }

    return removed;
  }

  private async removePendingJobsByStartup(
    queueName: QueueName,
    startupId: string,
  ): Promise<number> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      return 0;
    }

    const jobs = await queue.getJobs([
      "waiting",
      "delayed",
      "paused",
      "prioritized",
    ]);

    let removed = 0;
    for (const job of jobs) {
      if (job.data?.startupId !== startupId) {
        continue;
      }

      await job.remove().catch(() => undefined);
      removed += 1;
    }

    return removed;
  }

  async onModuleDestroy() {
    this.logger.log('Closing queue connections...');

    for (const queue of this.queues.values()) {
      await queue.close();
    }
    for (const events of this.queueEvents.values()) {
      await events.close();
    }
    this.queueEvents.clear();
    await this.queueConnection.quit().catch(() => undefined);

    this.logger.log('Queue connections closed');
  }

  private async getOrCreateQueueEvents(queueName: QueueName): Promise<QueueEvents> {
    const existing = this.queueEvents.get(queueName);
    if (existing) {
      return existing;
    }

    const events = new QueueEvents(queueName, {
      connection: this.redisConnectionOptions,
      ...(this.queuePrefix ? { prefix: this.queuePrefix } : {}),
    });
    events.on("error", (error) => {
      const message = String(error);
      const logMessage = `Queue events error for ${queueName}: ${message}`;
      if (this.isTransientRedisError(message)) {
        this.warnThrottled(
          `queue-events:${queueName}`,
          logMessage,
          TRANSIENT_REDIS_WARN_WINDOW_MS,
        );
        return;
      }
      this.logger.warn(logMessage);
    });
    await events.waitUntilReady();
    this.queueEvents.set(queueName, events);
    return events;
  }

  private isTransientRedisError(message: string): boolean {
    const normalized = message.toLowerCase();
    return TRANSIENT_REDIS_ERROR_PATTERNS.some((pattern) =>
      normalized.includes(pattern),
    );
  }

  private warnThrottled(key: string, message: string, windowMs: number): void {
    const now = Date.now();
    const lastLoggedAt = this.transientWarnTimestamps.get(key);
    if (typeof lastLoggedAt === "number" && now - lastLoggedAt < windowMs) {
      return;
    }
    this.transientWarnTimestamps.set(key, now);
    this.logger.warn(message);
  }
}
