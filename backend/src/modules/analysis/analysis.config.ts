import { QUEUE_NAMES } from '../../queue';

export const ANALYSIS_QUEUE_NAME = QUEUE_NAMES.TASK;

export const ANALYSIS_QUEUE_CONFIG = {
  name: ANALYSIS_QUEUE_NAME,
  concurrency: 5,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential' as const,
      delay: 2000,
    },
    removeOnComplete: false,
    removeOnFail: {
      count: 100,
    },
  },
};

export const ANALYSIS_JOB_PRIORITIES = {
  high: 1,
  medium: 5,
  low: 10,
} as const;

export const ANALYSIS_JOB_TIMEOUT = 300000; // 5 minutes

export const HIGH_SCORE_THRESHOLD = 80;
