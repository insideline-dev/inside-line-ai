/**
 * Job result interfaces for queue responses
 */

export interface BaseJobResult {
  success: boolean;
  jobId: string;
  duration: number; // ms
}

export interface TaskJobResult extends BaseJobResult {
  type: 'task';
  result: unknown;
}

export type JobResult = TaskJobResult;
