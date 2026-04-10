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
  type: "task";
  name: string;
  payload: Record<string, unknown>;
}

// Analysis job data types
export interface AnalysisBaseJobData extends BaseJobData {
  startupId: string;
  analysisJobId: string;
}

export interface ScoringJobData extends AnalysisBaseJobData {
  type: "scoring";
}

export interface MatchingJobData extends AnalysisBaseJobData {
  type: "matching";
}

export interface PdfJobData extends AnalysisBaseJobData {
  type: "pdf";
  requestedBy: string;
}

export interface MarketAnalysisJobData extends AnalysisBaseJobData {
  type: "market_analysis";
}

export type AnalysisJobData =
  | ScoringJobData
  | MatchingJobData
  | PdfJobData
  | MarketAnalysisJobData;

// AI pipeline job data types
export interface AiPipelineBaseJobData extends BaseJobData {
  type:
    | "ai_extraction"
    | "ai_enrichment"
    | "ai_scraping"
    | "ai_research"
    | "ai_evaluation"
    | "ai_synthesis";
  startupId: string;
  pipelineRunId: string;
}

export interface AiExtractionJobData extends AiPipelineBaseJobData {
  type: "ai_extraction";
}

export interface AiEnrichmentJobData extends AiPipelineBaseJobData {
  type: "ai_enrichment";
}

export interface AiScrapingJobData extends AiPipelineBaseJobData {
  type: "ai_scraping";
}

export interface AiResearchJobData extends AiPipelineBaseJobData {
  type: "ai_research";
}

export interface AiEvaluationJobData extends AiPipelineBaseJobData {
  type: "ai_evaluation";
}

export interface AiSynthesisJobData extends AiPipelineBaseJobData {
  type: "ai_synthesis";
}

export interface AiMatchingJobData extends BaseJobData {
  type: "ai_matching";
  startupId: string;
  analysisJobId: string;
  triggerSource: "approval" | "manual" | "retry" | "pipeline_completion" | "thesis_update";
}

export type AiPipelineJobData =
  | AiExtractionJobData
  | AiEnrichmentJobData
  | AiScrapingJobData
  | AiResearchJobData
  | AiEvaluationJobData
  | AiSynthesisJobData;

export interface DocumentClassificationJobData extends BaseJobData {
  type: "document_classification";
  startupId: string;
}

export type JobData =
  | TaskJobData
  | AnalysisJobData
  | AiPipelineJobData
  | AiMatchingJobData
  | DocumentClassificationJobData;
