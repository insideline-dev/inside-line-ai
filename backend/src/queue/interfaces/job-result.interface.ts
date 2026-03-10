/**
 * Job result interfaces for queue responses
 */

export interface BaseJobResult {
  success: boolean;
  jobId: string;
  duration: number; // ms
}

export interface TaskJobResult extends BaseJobResult {
  type: "task";
  result: unknown;
}

// Analysis job result types
export interface StartupScores {
  marketScore: number;
  teamScore: number;
  productScore: number;
  tractionScore: number;
  financialsScore: number;
}

export interface ScoringJobResult extends BaseJobResult {
  type: "scoring";
  scores: StartupScores;
}

export interface MatchingJobResult extends BaseJobResult {
  type: "matching";
  matchCount: number;
  highScoreMatches: number;
}

export interface PdfJobResult extends BaseJobResult {
  type: "pdf";
  pdfUrl: string;
  pdfKey: string;
}

export interface MarketAnalysis {
  marketSize: {
    tam: number;
    sam: number;
    som: number;
    currency: string;
  };
  competitors: Array<{
    name: string;
    description: string;
    fundingRaised?: number;
  }>;
  trends: string[];
  risks: string[];
  opportunities: string[];
}

export interface MarketAnalysisJobResult extends BaseJobResult {
  type: "market_analysis";
  analysis: MarketAnalysis;
}

export type AnalysisJobResult =
  | ScoringJobResult
  | MatchingJobResult
  | PdfJobResult
  | MarketAnalysisJobResult;

// AI pipeline job result types
export interface AiPipelineBaseJobResult extends BaseJobResult {
  type:
    | "ai_extraction"
    | "ai_enrichment"
    | "ai_scraping"
    | "ai_research"
    | "ai_evaluation"
    | "ai_synthesis";
  startupId: string;
  pipelineRunId: string;
  data: unknown;
}

export interface AiExtractionJobResult extends AiPipelineBaseJobResult {
  type: "ai_extraction";
}

export interface AiEnrichmentJobResult extends AiPipelineBaseJobResult {
  type: "ai_enrichment";
}

export interface AiScrapingJobResult extends AiPipelineBaseJobResult {
  type: "ai_scraping";
}

export interface AiResearchJobResult extends AiPipelineBaseJobResult {
  type: "ai_research";
}

export interface AiEvaluationJobResult extends AiPipelineBaseJobResult {
  type: "ai_evaluation";
}

export interface AiSynthesisJobResult extends AiPipelineBaseJobResult {
  type: "ai_synthesis";
}

export interface AiMatchingJobResult extends BaseJobResult {
  type: "ai_matching";
  startupId: string;
  analysisJobId: string;
  data: {
    triggerSource: "approval" | "manual" | "retry" | "pipeline_completion" | "thesis_update";
    candidatesEvaluated: number;
    matchesFound: number;
    failedCandidates: number;
    notificationsSent: number;
    notificationError?: string;
  };
}

export type AiPipelineJobResult =
  | AiExtractionJobResult
  | AiEnrichmentJobResult
  | AiScrapingJobResult
  | AiResearchJobResult
  | AiEvaluationJobResult
  | AiSynthesisJobResult;

export type JobResult =
  | TaskJobResult
  | AnalysisJobResult
  | AiPipelineJobResult
  | AiMatchingJobResult;
