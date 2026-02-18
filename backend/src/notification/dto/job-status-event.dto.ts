export type JobType =
  | "scoring"
  | "pdf"
  | "matching"
  | "market_analysis"
  | "ai_extraction"
  | "ai_enrichment"
  | "ai_scraping"
  | "ai_research"
  | "ai_evaluation"
  | "ai_synthesis";
export type JobStatus = "pending" | "processing" | "completed" | "failed";

export interface JobStatusEvent {
  jobId: string;
  jobType: JobType;
  status: JobStatus;
  startupId?: string;
  pipelineRunId?: string;
  progress?: number;
  result?: unknown;
  error?: string;
}
