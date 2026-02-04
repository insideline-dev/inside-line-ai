// Re-export from queue interfaces for analysis job types
export type {
  AnalysisBaseJobData,
  ScoringJobData,
  MatchingJobData,
  PdfJobData,
  MarketAnalysisJobData,
  AnalysisJobData,
} from '../../../queue/interfaces';

export type {
  ScoringJobResult,
  MatchingJobResult,
  PdfJobResult,
  MarketAnalysisJobResult,
  AnalysisJobResult,
  StartupScores,
  MarketAnalysis,
} from '../../../queue/interfaces';

export * from './scores.interface';
