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

// Analysis job result types
export interface StartupScores {
  marketScore: number;
  teamScore: number;
  productScore: number;
  tractionScore: number;
  financialsScore: number;
}

export interface ScoringJobResult extends BaseJobResult {
  type: 'scoring';
  scores: StartupScores;
}

export interface MatchingJobResult extends BaseJobResult {
  type: 'matching';
  matchCount: number;
  highScoreMatches: number;
}

export interface PdfJobResult extends BaseJobResult {
  type: 'pdf';
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
  type: 'market_analysis';
  analysis: MarketAnalysis;
}

export type AnalysisJobResult =
  | ScoringJobResult
  | MatchingJobResult
  | PdfJobResult
  | MarketAnalysisJobResult;

export type JobResult = TaskJobResult | AnalysisJobResult;
