/**
 * Queue configuration for BullMQ
 * Defines queue names, default job options, and concurrency limits
 */

export const QUEUE_NAMES = {
  TASK: "task-queue",
  AI_EXTRACTION: "ai-extraction",
  AI_SCRAPING: "ai-scraping",
  AI_RESEARCH: "ai-research",
  AI_EVALUATION: "ai-evaluation",
  AI_SYNTHESIS: "ai-synthesis",
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

export interface QueueDepthLimit {
  maxDepth: number;
  maxPerUser: number;
}

export type QueueDepthLimits = Record<QueueName, QueueDepthLimit>;

export const DEFAULT_JOB_OPTIONS = {
  attempts: 3,
  backoff: {
    type: "exponential" as const,
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
  [QUEUE_NAMES.AI_EXTRACTION]: 4,
  [QUEUE_NAMES.AI_SCRAPING]: 4,
  [QUEUE_NAMES.AI_RESEARCH]: 6,
  [QUEUE_NAMES.AI_EVALUATION]: 8,
  [QUEUE_NAMES.AI_SYNTHESIS]: 2,
} as const;

// Safe defaults; real values should be resolved via ConfigService.
export const DEFAULT_QUEUE_DEPTH_LIMITS: QueueDepthLimits = {
  [QUEUE_NAMES.TASK]: {
    maxDepth: 1000,
    maxPerUser: 20,
  },
  [QUEUE_NAMES.AI_EXTRACTION]: {
    maxDepth: 500,
    maxPerUser: 5,
  },
  [QUEUE_NAMES.AI_SCRAPING]: {
    maxDepth: 500,
    maxPerUser: 5,
  },
  [QUEUE_NAMES.AI_RESEARCH]: {
    maxDepth: 500,
    maxPerUser: 5,
  },
  [QUEUE_NAMES.AI_EVALUATION]: {
    maxDepth: 500,
    maxPerUser: 5,
  },
  [QUEUE_NAMES.AI_SYNTHESIS]: {
    maxDepth: 500,
    maxPerUser: 5,
  },
} as const;

function toPositiveInt(value: number, fallback: number): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  const normalized = Math.trunc(value);
  return normalized > 0 ? normalized : fallback;
}

export function resolveQueueDepthLimits(
  getNumber: (key: string, defaultValue: number) => number,
): QueueDepthLimits {
  return {
    [QUEUE_NAMES.TASK]: {
      maxDepth: toPositiveInt(
        getNumber("QUEUE_MAX_DEPTH_TASK", DEFAULT_QUEUE_DEPTH_LIMITS[QUEUE_NAMES.TASK].maxDepth),
        DEFAULT_QUEUE_DEPTH_LIMITS[QUEUE_NAMES.TASK].maxDepth,
      ),
      maxPerUser: toPositiveInt(
        getNumber("QUEUE_MAX_PER_USER_TASK", DEFAULT_QUEUE_DEPTH_LIMITS[QUEUE_NAMES.TASK].maxPerUser),
        DEFAULT_QUEUE_DEPTH_LIMITS[QUEUE_NAMES.TASK].maxPerUser,
      ),
    },
    [QUEUE_NAMES.AI_EXTRACTION]: {
      maxDepth: toPositiveInt(
        getNumber("QUEUE_MAX_DEPTH_AI_EXTRACTION", DEFAULT_QUEUE_DEPTH_LIMITS[QUEUE_NAMES.AI_EXTRACTION].maxDepth),
        DEFAULT_QUEUE_DEPTH_LIMITS[QUEUE_NAMES.AI_EXTRACTION].maxDepth,
      ),
      maxPerUser: toPositiveInt(
        getNumber("QUEUE_MAX_PER_USER_AI_EXTRACTION", DEFAULT_QUEUE_DEPTH_LIMITS[QUEUE_NAMES.AI_EXTRACTION].maxPerUser),
        DEFAULT_QUEUE_DEPTH_LIMITS[QUEUE_NAMES.AI_EXTRACTION].maxPerUser,
      ),
    },
    [QUEUE_NAMES.AI_SCRAPING]: {
      maxDepth: toPositiveInt(
        getNumber("QUEUE_MAX_DEPTH_AI_SCRAPING", DEFAULT_QUEUE_DEPTH_LIMITS[QUEUE_NAMES.AI_SCRAPING].maxDepth),
        DEFAULT_QUEUE_DEPTH_LIMITS[QUEUE_NAMES.AI_SCRAPING].maxDepth,
      ),
      maxPerUser: toPositiveInt(
        getNumber("QUEUE_MAX_PER_USER_AI_SCRAPING", DEFAULT_QUEUE_DEPTH_LIMITS[QUEUE_NAMES.AI_SCRAPING].maxPerUser),
        DEFAULT_QUEUE_DEPTH_LIMITS[QUEUE_NAMES.AI_SCRAPING].maxPerUser,
      ),
    },
    [QUEUE_NAMES.AI_RESEARCH]: {
      maxDepth: toPositiveInt(
        getNumber("QUEUE_MAX_DEPTH_AI_RESEARCH", DEFAULT_QUEUE_DEPTH_LIMITS[QUEUE_NAMES.AI_RESEARCH].maxDepth),
        DEFAULT_QUEUE_DEPTH_LIMITS[QUEUE_NAMES.AI_RESEARCH].maxDepth,
      ),
      maxPerUser: toPositiveInt(
        getNumber("QUEUE_MAX_PER_USER_AI_RESEARCH", DEFAULT_QUEUE_DEPTH_LIMITS[QUEUE_NAMES.AI_RESEARCH].maxPerUser),
        DEFAULT_QUEUE_DEPTH_LIMITS[QUEUE_NAMES.AI_RESEARCH].maxPerUser,
      ),
    },
    [QUEUE_NAMES.AI_EVALUATION]: {
      maxDepth: toPositiveInt(
        getNumber("QUEUE_MAX_DEPTH_AI_EVALUATION", DEFAULT_QUEUE_DEPTH_LIMITS[QUEUE_NAMES.AI_EVALUATION].maxDepth),
        DEFAULT_QUEUE_DEPTH_LIMITS[QUEUE_NAMES.AI_EVALUATION].maxDepth,
      ),
      maxPerUser: toPositiveInt(
        getNumber("QUEUE_MAX_PER_USER_AI_EVALUATION", DEFAULT_QUEUE_DEPTH_LIMITS[QUEUE_NAMES.AI_EVALUATION].maxPerUser),
        DEFAULT_QUEUE_DEPTH_LIMITS[QUEUE_NAMES.AI_EVALUATION].maxPerUser,
      ),
    },
    [QUEUE_NAMES.AI_SYNTHESIS]: {
      maxDepth: toPositiveInt(
        getNumber("QUEUE_MAX_DEPTH_AI_SYNTHESIS", DEFAULT_QUEUE_DEPTH_LIMITS[QUEUE_NAMES.AI_SYNTHESIS].maxDepth),
        DEFAULT_QUEUE_DEPTH_LIMITS[QUEUE_NAMES.AI_SYNTHESIS].maxDepth,
      ),
      maxPerUser: toPositiveInt(
        getNumber("QUEUE_MAX_PER_USER_AI_SYNTHESIS", DEFAULT_QUEUE_DEPTH_LIMITS[QUEUE_NAMES.AI_SYNTHESIS].maxPerUser),
        DEFAULT_QUEUE_DEPTH_LIMITS[QUEUE_NAMES.AI_SYNTHESIS].maxPerUser,
      ),
    },
  };
}

// Retry-After header value in seconds when queue is full
export const QUEUE_RETRY_AFTER_SECONDS = 60;
