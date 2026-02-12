import { Job, Worker, ConnectionOptions, UnrecoverableError } from "bullmq";
import { Logger, BadRequestException } from "@nestjs/common";
import Redis, { type RedisOptions } from "ioredis";
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
  private static readonly sharedRedisConnections = new Map<
    string,
    { client: unknown; refCount: number }
  >();

  protected abstract readonly logger: Logger;
  protected worker?: Worker;
  private initialized = false;
  private shuttingDown = false;
  private recovering = false;
  private restartTimer?: NodeJS.Timeout;
  private healthCheckTimer?: NodeJS.Timeout;
  private sharedConnectionKey?: string;
  private sharedConnectionClient?: { status?: string };

  constructor(
    protected readonly queueName: string,
    protected readonly redisConnection: ConnectionOptions,
    protected readonly concurrency: number,
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
          concurrency: this.concurrency,
          // Don't auto-run if connection fails - wait for manual retry
          autorun: true,
        },
      );

      this.worker.on('completed', (job) => {
        this.logger.log(`Job ${job.id} completed`);
      });

      this.worker.on('failed', (job, err) => {
        this.logger.error(`Job ${job?.id} failed: ${err.message}`);
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

      this.initialized = true;
      this.shuttingDown = false;

      // Wait for worker to be ready before marking as initialized
      // This ensures the worker has connected to Redis and is polling for jobs
      await this.worker.waitUntilReady().catch((err) => {
        this.logger.warn(`Worker ready check failed for ${this.queueName}: ${String(err)}`);
      });

      this.startHealthChecks();
      this.logger.log(
        `Worker initialized for queue ${this.queueName} with concurrency ${this.concurrency}`,
      );
    } catch (error) {
      this.logger.warn(
        `Failed to initialize worker for ${this.queueName}: Redis unavailable. Queue processing disabled.`,
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
    await this.releaseWorkerConnection();
    this.initialized = false;
  }

  private shouldRecoverFromError(message: string): boolean {
    const normalized = message.toLowerCase();
    return (
      normalized.includes('connection is closed') ||
      normalized.includes('connection closed') ||
      normalized.includes('econnreset') ||
      normalized.includes('econnrefused') ||
      normalized.includes('etimedout') ||
      normalized.includes('socket hang up')
    );
  }

  private scheduleRecovery(reason: string): void {
    if (this.shuttingDown || this.recovering || this.restartTimer) {
      return;
    }

    this.logger.warn(
      `Scheduling worker recovery for ${this.queueName}: ${reason}`,
    );
    this.restartTimer = setTimeout(() => {
      this.restartTimer = undefined;
      void this.recoverWorker(reason);
    }, 1000);
  }

  private async recoverWorker(reason: string): Promise<void> {
    if (this.shuttingDown || this.recovering) {
      return;
    }

    this.recovering = true;
    this.logger.warn(`Recovering worker for ${this.queueName}: ${reason}`);

    try {
      if (this.worker) {
        await this.worker.close().catch(() => undefined);
      }
      this.worker = undefined;
      this.initialized = false;

      if (!this.shuttingDown) {
        this.initialize();
      }
    } finally {
      this.recovering = false;
    }
  }

  private startHealthChecks(): void {
    if (this.healthCheckTimer) {
      return;
    }

    this.healthCheckTimer = setInterval(() => {
      void this.runHealthCheck();
    }, 30_000);
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
      if (
        this.sharedConnectionClient &&
        (this.sharedConnectionClient.status === "end" ||
          this.sharedConnectionClient.status === "close")
      ) {
        this.scheduleRecovery(
          `shared redis client status is ${this.sharedConnectionClient.status}`,
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.scheduleRecovery(`health check ping failed: ${message}`);
    }
  }

  private acquireWorkerConnection(): ConnectionOptions {
    if (this.hasRedisLikeShape(this.redisConnection)) {
      return this.redisConnection;
    }

    const normalized = this.normalizeRedisOptions(this.redisConnection);
    const key = this.connectionKey(normalized);
    const existing = BaseProcessor.sharedRedisConnections.get(key);
    if (existing) {
      existing.refCount += 1;
      this.sharedConnectionKey = key;
      this.sharedConnectionClient = existing.client as { status?: string };
      return existing.client as ConnectionOptions;
    }

    const client = new Redis(normalized);
    const entry = { client, refCount: 1 };
    BaseProcessor.sharedRedisConnections.set(key, entry);
    this.sharedConnectionKey = key;
    this.sharedConnectionClient = client;
    return client as unknown as ConnectionOptions;
  }

  private async releaseWorkerConnection(): Promise<void> {
    if (!this.sharedConnectionKey) {
      return;
    }

    const key = this.sharedConnectionKey;
    const entry = BaseProcessor.sharedRedisConnections.get(key);
    this.sharedConnectionKey = undefined;
    this.sharedConnectionClient = undefined;

    if (!entry) {
      return;
    }

    entry.refCount -= 1;
    if (entry.refCount > 0) {
      return;
    }

    BaseProcessor.sharedRedisConnections.delete(key);
    const client = entry.client as {
      quit: () => Promise<unknown>;
      disconnect: () => void;
    };
    await client.quit().catch(() => {
      client.disconnect();
    });
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

  private connectionKey(options: RedisOptions): string {
    const host = options.host ?? "localhost";
    const port = options.port ?? 6379;
    const db = options.db ?? 0;
    const username = options.username ?? "";
    const tlsEnabled = options.tls ? "tls" : "plain";
    return `${host}:${port}:${db}:${username}:${tlsEnabled}`;
  }
}
