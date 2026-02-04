/**
 * Job data interfaces for queue payloads
 */

export interface BaseJobData {
  type: string;
  userId: string;
  priority?: number;
  metadata?: Record<string, unknown>;
}

export interface TaskJobData extends BaseJobData {
  type: 'task';
  name: string;
  payload: Record<string, unknown>;
}

// Analysis job data types
export interface AnalysisBaseJobData extends BaseJobData {
  startupId: string;
  analysisJobId: string;
}

export interface ScoringJobData extends AnalysisBaseJobData {
  type: 'scoring';
}

export interface MatchingJobData extends AnalysisBaseJobData {
  type: 'matching';
}

export interface PdfJobData extends AnalysisBaseJobData {
  type: 'pdf';
  requestedBy: string;
}

export interface MarketAnalysisJobData extends AnalysisBaseJobData {
  type: 'market_analysis';
}

export type AnalysisJobData =
  | ScoringJobData
  | MatchingJobData
  | PdfJobData
  | MarketAnalysisJobData;

export type JobData = TaskJobData | AnalysisJobData;
