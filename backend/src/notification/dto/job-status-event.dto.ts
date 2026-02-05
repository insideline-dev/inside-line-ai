export type JobType = 'scoring' | 'pdf' | 'matching' | 'market_analysis';
export type JobStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface JobStatusEvent {
  jobId: string;
  jobType: JobType;
  status: JobStatus;
  progress?: number;
  result?: unknown;
  error?: string;
}
