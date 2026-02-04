import { Job, Worker, ConnectionOptions, UnrecoverableError } from 'bullmq';
import { Logger, BadRequestException } from '@nestjs/common';
import type { JobData, JobResult } from '../interfaces';

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
 * Abstract base processor for all job workers
 * Handles error wrapping and retry logic automatically
 */
export abstract class BaseProcessor<
  TData extends JobData,
  TResult extends JobResult,
> {
  protected abstract readonly logger: Logger;
  protected worker!: Worker;

  constructor(
    protected readonly queueName: string,
    protected readonly redisConnection: ConnectionOptions,
    protected readonly concurrency: number,
  ) {}

  /**
   * Initialize the worker - call this in the concrete processor's onModuleInit
   */
  protected initialize() {
    this.worker = new Worker(
      this.queueName,
      async (job: Job<TData>) => this.processJob(job),
      {
        connection: this.redisConnection,
        concurrency: this.concurrency,
      },
    );

    this.worker.on('completed', (job) => {
      this.logger.log(`Job ${job.id} completed`);
    });

    this.worker.on('failed', (job, err) => {
      this.logger.error(`Job ${job?.id} failed: ${err.message}`);
    });

    this.worker.on('error', (err) => {
      this.logger.error(`Worker error: ${err.message}`);
    });

    this.logger.log(
      `Worker initialized for queue ${this.queueName} with concurrency ${this.concurrency}`,
    );
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
    await this.worker.close();
    this.logger.log(`Worker closed for queue ${this.queueName}`);
  }
}
