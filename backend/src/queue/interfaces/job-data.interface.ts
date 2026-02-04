/**
 * Job data interfaces for queue payloads
 */

export interface BaseJobData {
  userId: string;
  priority?: number;
  metadata?: Record<string, unknown>;
}

export interface TaskJobData extends BaseJobData {
  type: 'task';
  name: string;
  payload: Record<string, unknown>;
}

export type JobData = TaskJobData;
