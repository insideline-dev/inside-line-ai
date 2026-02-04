/**
 * Queue configuration for BullMQ
 * Defines queue names, default job options, and concurrency limits
 */

export const QUEUE_NAMES = {
  TASK: 'task-queue',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

export const DEFAULT_JOB_OPTIONS = {
  attempts: 3,
  backoff: {
    type: 'exponential' as const,
    delay: 1000,
  },
  removeOnComplete: {
    age: 3600, // 1 hour
    count: 100,
  },
  removeOnFail: {
    age: 86400, // 24 hours
  },
};

// Per-queue concurrency limits
export const QUEUE_CONCURRENCY = {
  [QUEUE_NAMES.TASK]: 10,
} as const;

// Queue depth limits for backpressure (configurable via env)
export const QUEUE_DEPTH_LIMITS = {
  [QUEUE_NAMES.TASK]: {
    maxDepth: parseInt(process.env.QUEUE_MAX_DEPTH_TASK || '1000', 10),
    maxPerUser: parseInt(process.env.QUEUE_MAX_PER_USER_TASK || '20', 10),
  },
} as const;

// Retry-After header value in seconds when queue is full
export const QUEUE_RETRY_AFTER_SECONDS = 60;
