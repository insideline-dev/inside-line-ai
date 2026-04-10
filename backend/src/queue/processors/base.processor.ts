import { Job, Worker, Queue, ConnectionOptions, UnrecoverableError } from "bullmq";
import { Logger, BadRequestException } from "@nestjs/common";
import type { RedisOptions } from "ioredis";
import type { BaseJobData } from "../interfaces/job-data.interface";
import type { BaseJobResult } from "../interfaces/job-result.interface";
import { buildBullRedisConnection } from "../redis-connection.util";

// Patterns that indicate a validation/input error (should not retry)
const NON_RETRYABLE_PATTERNS = [
  'cannot be empty',
  'is required',
  'invalid',
  'must be',
  'validation',
  'bad request',
  'not found',
  'not supported',
  'too large',
  'too small',
  'out of range',
];

const HEALTH_CHECK_INTERVAL_MS = 15_000;
const STALLED_CONSUMPTION_THRESHOLD_MS = 45_000;
const RECOVERY_DELAY_MS = 5_000;
const TRANSIENT_REDIS_WARN_WINDOW_MS = 30_000;
const AI_JOB_LOCK_DURATION_MS = 15 * 60 * 1000;
const AI_JOB_STALLED_INTERVAL_MS = 15 * 60 * 1000;
const AI_JOB_MAX_STALLED_COUNT = 3;
const TRANSIENT_REDIS_ERROR_PATTERNS = [
  "connection is closed",
  "connection closed",
  "econnreset",
  "econnrefused",
  "etimedout",
  "socket hang up",
];

/**
 * Parse REDIS_URL into ConnectionOptions
 */
export function parseRedisUrl(redisUrl: string): ConnectionOptions {
  return buildBullRedisConnection(redisUrl);
}

/**
 * Abstract base processor for all job workers
 * Handles error wrapping and retry logic automatically
 */
export abstract class BaseProcessor<
  TData extends BaseJobData,
  TResult extends BaseJobResult,
> {
  protected abstract readonly logger: Logger;
  protected worker?: Worker;
  private initialized = false;
  private shuttingDown = false;
  private recovering = false;
  private restartTimer?: NodeJS.Timeout;
  private healthCheckTimer?: NodeJS.Timeout;
  private probeQueue?: Queue;
  private probeQueueConnectionClient?: {
    quit: () => Promise<unknown>;
    disconnect: () => void;
  };
  private transientWarnTimestamps = new Map<string, number>();
  private lastJobActivityAt = Date.now();

  constructor(
    protected readonly queueName: string,
    protected readonly redisConnection: ConnectionOptions,
    protected readonly concurrency: number,
    protected readonly queuePrefix?: string,
  ) {}

  /**
   * Initialize the worker - call this in the concrete processor's onModuleInit
   * Gracefully skips if Redis is unavailable
   */
  protected async initialize() {
    if (this.initialized) return;

    try {
      const workerConnection = this.acquireWorkerConnection();
      this.worker = new Worker(
        this.queueName,
        async (job: Job<TData>) => this.processJob(job),
        {
          connection: workerConnection,
          ...(this.queuePrefix ? { prefix: this.queuePrefix } : {}),
          concurrency: this.concurrency,
          autorun: true,
          lockDuration: AI_JOB_LOCK_DURATION_MS,
          stalledInterval: AI_JOB_STALLED_INTERVAL_MS,
          maxStalledCount: AI_JOB_MAX_STALLED_COUNT,
        },
      );

      this.worker.on('completed', (job) => {
        this.lastJobActivityAt = Date.now();
        this.logger.log(`Job ${job.id} completed`);
      });

      this.worker.on('failed', (job, err) => {
        this.lastJobActivityAt = Date.now();
        this.logger.error(`Job ${job?.id} failed: ${err.message}`);
      });

      this.worker.on('active', () => {
        this.lastJobActivityAt = Date.now();
      });

      this.worker.on('stalled', (jobId) => {
        this.logger.warn(`Job ${jobId} stalled in queue ${this.queueName}`);
        if (jobId) {
          void this.handleStalledJob(String(jobId));
        }
      });

      // Only log connection errors once, not continuously
      let errorLogged = false;
      this.worker.on('error', (err) => {
        const message = err?.message ?? String(err);
        if (!errorLogged) {
          this.logger.warn(
            `Worker for ${this.queueName} cannot connect to Redis: ${message}. Queue processing disabled.`,
          );
          errorLogged = true;
        }
        if (this.shouldRecoverFromError(message)) {
          this.scheduleRecovery(`worker error: ${message}`);
        }
      });

      this.worker.on('closed', () => {
        if (this.shuttingDown || this.recovering) {
          return;
        }
        this.scheduleRecovery('worker closed');
      });

      this.shuttingDown = false;
      this.lastJobActivityAt = Date.now();

      // Wait for worker to be ready before marking as initialized
      // This ensures the worker has connected to Redis and is polling for jobs
      const waitUntilReady = (
        this.worker as { waitUntilReady?: () => Promise<unknown> }
      ).waitUntilReady;
      if (typeof waitUntilReady === "function") {
        await waitUntilReady.call(this.worker);
      }

      this.initialized = true;
      this.startHealthChecks();
      this.logger.log(
        `Worker initialized for queue ${this.queueName} with concurrency ${this.concurrency}`,
      );
    } catch (error) {
      if (this.worker) {
        await this.worker.close().catch(() => undefined);
        this.worker = undefined;
      }
      this.initialized = false;
      const message = error instanceof Error ? error.message : String(error);
      if (!this.shuttingDown && !this.recovering) {
        this.scheduleRecovery(`initialization failed: ${message}`);
      }
      this.logger.warn(
        `Failed to initialize worker for ${this.queueName}: ${message}.`,
      );
    }
  }

  /**
   * Internal job processing with error handling
   */
  private async processJob(job: Job<TData>): Promise<TResult> {
    const startTime = Date.now();

    try {
      this.logger.log(`Processing job ${job.id} of type ${job.data.type}`);

      // Execute the actual work (implemented by concrete processors)
      const result = await this.process(job);

      return {
        ...result,
        success: true,
        jobId: job.id!,
        duration: Date.now() - startTime,
      } as TResult;
    } catch (error) {
      // Wrap validation/input errors to prevent retries
      const wrappedError = this.wrapIfNonRetryable(error);
      throw wrappedError;
    }
  }

  /**
   * Implement this method in concrete processors
   * Should return the result without jobId/duration (added by base)
   */
  protected abstract process(
    job: Job<TData>,
  ): Promise<Omit<TResult, 'jobId' | 'duration' | 'success'>>;

  protected async onWorkerStalled(_job: Job<TData>): Promise<void> {
    return Promise.resolve();
  }

  /**
   * Check if an error is a validation/input error that should not be retried
   */
  private isNonRetryableError(error: unknown): boolean {
    if (error instanceof BadRequestException) return true;
    if (error instanceof UnrecoverableError) return true;

    const message =
      error instanceof Error
        ? error.message.toLowerCase()
        : String(error).toLowerCase();
    return NON_RETRYABLE_PATTERNS.some((pattern) => message.includes(pattern));
  }

  /**
   * Wrap non-retryable errors in UnrecoverableError to prevent BullMQ retries
   */
  private wrapIfNonRetryable(error: unknown): Error {
    if (error instanceof UnrecoverableError) return error;

    if (this.isNonRetryableError(error)) {
      const message = error instanceof Error ? error.message : String(error);
      return new UnrecoverableError(message);
    }

    return error instanceof Error ? error : new Error(String(error));
  }

  /**
   * Close the worker gracefully
   */
  async close() {
    this.shuttingDown = true;
    this.clearHealthChecks();
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = undefined;
    }
    if (this.worker) {
      await this.worker.close();
      this.logger.log(`Worker closed for queue ${this.queueName}`);
      this.worker = undefined;
    }
    if (this.probeQueue) {
      await this.probeQueue.close().catch(() => undefined);
      this.probeQueue = undefined;
    }
    if (this.probeQueueConnectionClient) {
      const client = this.probeQueueConnectionClient;
      this.probeQueueConnectionClient = undefined;
      await client.quit().catch(() => {
        client.disconnect();
      });
    }
    this.initialized = false;
  }

  private shouldRecoverFromError(message: string): boolean {
    return this.isTransientRedisError(message);
  }

  private scheduleRecovery(reason: string): void {
    if (this.shuttingDown || this.recovering || this.restartTimer) {
      return;
    }

    const message = `Scheduling worker recovery for ${this.queueName}: ${reason}`;
    if (this.isTransientRedisError(reason)) {
      this.warnThrottled(
        `schedule:${this.queueName}`,
        message,
        TRANSIENT_REDIS_WARN_WINDOW_MS,
      );
    } else {
      this.logger.warn(message);
    }
    this.restartTimer = setTimeout(() => {
      this.restartTimer = undefined;
      void this.recoverWorker(reason);
    }, RECOVERY_DELAY_MS);
  }

  private async recoverWorker(reason: string): Promise<void> {
    if (this.shuttingDown || this.recovering) {
      return;
    }

    this.recovering = true;
    let recovered = false;
    const message = `Recovering worker for ${this.queueName}: ${reason}`;
    if (this.isTransientRedisError(reason)) {
      this.warnThrottled(
        `recover:${this.queueName}`,
        message,
        TRANSIENT_REDIS_WARN_WINDOW_MS,
      );
    } else {
      this.logger.warn(message);
    }

    try {
      if (this.worker) {
        await this.worker.close().catch(() => undefined);
      }
      this.worker = undefined;
      this.initialized = false;

      if (!this.shuttingDown) {
        await this.initialize();
        recovered = this.initialized;
      }
    } finally {
      this.recovering = false;
    }

    if (!recovered && !this.shuttingDown) {
      this.scheduleRecovery(`recovery attempt failed: ${reason}`);
    }
  }

  private startHealthChecks(): void {
    if (this.healthCheckTimer) {
      return;
    }

    this.healthCheckTimer = setInterval(() => {
      void this.runHealthCheck();
    }, HEALTH_CHECK_INTERVAL_MS);
  }

  private clearHealthChecks(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = undefined;
    }
  }

  private async runHealthCheck(): Promise<void> {
    if (this.shuttingDown || this.recovering || !this.worker) {
      return;
    }

    if (!this.worker.isRunning()) {
      this.scheduleRecovery('worker is not running');
      return;
    }

    try {
      const client = await this.worker.client;
      await client.ping();
      await this.checkQueueConsumptionLag();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.scheduleRecovery(`health check ping failed: ${message}`);
    }
  }

  private async checkQueueConsumptionLag(): Promise<void> {
    const queue = this.getOrCreateProbeQueue();
    const counts = await queue.getJobCounts("waiting", "prioritized", "active");
    const waiting = counts.waiting ?? 0;
    const prioritized = counts.prioritized ?? 0;
    const active = counts.active ?? 0;
    const pending = waiting + prioritized;

    if (pending === 0 || active > 0) {
      this.lastJobActivityAt = Date.now();
      return;
    }

    const idleForMs = Date.now() - this.lastJobActivityAt;
    if (idleForMs < STALLED_CONSUMPTION_THRESHOLD_MS) {
      return;
    }

    this.scheduleRecovery(
      `queue appears stalled (pending=${pending}, active=${active}, idle=${idleForMs}ms)`,
    );
  }

  private acquireWorkerConnection(): ConnectionOptions {
    if (this.hasRedisLikeShape(this.redisConnection)) {
      return this.redisConnection;
    }

    return this.normalizeRedisOptions(this.redisConnection);
  }

  private getOrCreateProbeQueue(): Queue {
    if (this.probeQueue) {
      return this.probeQueue;
    }

    const probeConnection = this.acquireProbeQueueConnection();
    this.probeQueue = new Queue(this.queueName, {
      connection: probeConnection,
      ...(this.queuePrefix ? { prefix: this.queuePrefix } : {}),
    });
    this.probeQueue.on("error", (error) => {
      const message = String(error);
      const logMessage = `Queue probe error for ${this.queueName}: ${message}`;
      if (this.isTransientRedisError(message)) {
        this.warnThrottled(
          `probe:${this.queueName}`,
          logMessage,
          TRANSIENT_REDIS_WARN_WINDOW_MS,
        );
        return;
      }
      this.logger.warn(logMessage);
    });
    return this.probeQueue;
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

  private acquireProbeQueueConnection(): ConnectionOptions {
    if (this.hasRedisLikeShape(this.redisConnection)) {
      const duplicate = (
        this.redisConnection as {
          duplicate: () => unknown;
        }
      ).duplicate() as {
        quit: () => Promise<unknown>;
        disconnect: () => void;
      };
      this.probeQueueConnectionClient = duplicate;
      return duplicate as unknown as ConnectionOptions;
    }

    return this.normalizeRedisOptions(this.redisConnection);
  }

  private hasRedisLikeShape(connection: ConnectionOptions): boolean {
    return Boolean(
      connection &&
        typeof connection === "object" &&
        "duplicate" in (connection as object) &&
        typeof (connection as { duplicate?: unknown }).duplicate === "function",
    );
  }

  private normalizeRedisOptions(connection: ConnectionOptions): RedisOptions {
    const options = { ...(connection as RedisOptions) };
    if (options.maxRetriesPerRequest !== null) {
      options.maxRetriesPerRequest = null;
    }
    if (!options.retryStrategy) {
      options.retryStrategy = (attempt) =>
        Math.min(Math.max(attempt, 1) * 100, 2000);
    }
    options.lazyConnect = true;
    options.connectTimeout = options.connectTimeout ?? 10_000;
    options.keepAlive = options.keepAlive ?? 30_000;
    return options;
  }

  private async handleStalledJob(jobId: string): Promise<void> {
    try {
      const queue = this.getOrCreateProbeQueue();
      const job = await queue.getJob(jobId);
      if (!job) {
        this.logger.warn(
          `Unable to resolve stalled job ${jobId} in queue ${this.queueName}`,
        );
        return;
      }
      await this.onWorkerStalled(job as Job<TData>);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Failed to handle stalled job ${jobId} in queue ${this.queueName}: ${message}`,
      );
    }
  }

}
