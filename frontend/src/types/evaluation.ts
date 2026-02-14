export interface SectionScores {
  team: number;
  market: number;
  product: number;
  traction: number;
  businessModel: number;
  gtm: number;
  financials: number;
  competitiveAdvantage: number;
  legal: number;
  dealTerms: number;
  exitPotential: number;
}

export interface TeamMemberEvaluation {
  name: string;
  role: string;
  linkedinUrl?: string;
  linkedinAnalysis?: {
    currentPosition: string;
    company: string;
    yearsExperience: number;
    education: string[];
    previousCompanies: string[];
    skills: string[];
    relevantExperience: string;
    strengthsForRole: string[];
    potentialConcerns: string[];
    founderFitScore: number;
  };
}

export interface TeamComposition {
  hasBusinessLeader: boolean;
  hasTechnicalLeader: boolean;
  hasIndustryExpert: boolean;
  hasOperationsLeader?: boolean;
  teamBalance: string;
  gapsIdentified: string[];
}

export interface MemoSection {
  title: string;
  content: string;
  highlights?: string[];
  concerns?: string[];
}

export interface InvestorMemo {
  executiveSummary: string;
  sections: MemoSection[];
  recommendation: string;
  riskLevel: "low" | "medium" | "high";
}

export interface FounderReport {
  summary: string;
  sections: MemoSection[];
  actionItems: string[];
}

export interface Source {
  url: string;
  title: string;
  type: "website" | "linkedin" | "news" | "research";
  relevance: string;
}

export interface AnalysisProgress {
  currentStage: number;
  currentStageLabel: string;
  completedAgents: string[];
  currentAgent: string | null;
  startedAt: string;
  lastUpdatedAt: string;
  stageProgress: {
    stage: number;
    label: string;
    status: "pending" | "running" | "completed";
    startedAt?: string;
    completedAt?: string;
  }[];
}

export interface Evaluation {
  id: string;
  startupId: string;

  // Section scores
  sectionScores?: SectionScores;

  // Team
  teamData?: Record<string, unknown>;
  teamMemberEvaluations?: TeamMemberEvaluation[];
  teamScore?: number;
  founderMarketFit?: number;
  executionRiskNotes?: string;
  teamComposition?: TeamComposition;

  // Market
  marketData?: Record<string, unknown>;
  marketScore?: number;
  tamValidation?: Record<string, unknown>;
  marketCredibility?: number;

  // Product
  productData?: Record<string, unknown>;
  productScore?: number;
  productSummary?: string;
  extractedScreenshots?: string[];
  extractedDemoVideos?: string[];
  extractedFeatures?: string[];
  extractedTechStack?: string[];

  // Traction
  tractionData?: Record<string, unknown>;
  tractionScore?: number;
  momentumScore?: number;
  tractionCredibility?: number;

  // Business model
  businessModelData?: Record<string, unknown>;
  businessModelScore?: number;

  // GTM
  gtmData?: Record<string, unknown>;
  gtmScore?: number;

  // Financials
  financialsData?: Record<string, unknown>;
  financialsScore?: number;

  // Competitive advantage
  competitiveAdvantageData?: Record<string, unknown>;
  competitiveAdvantageScore?: number;

  // Legal
  legalData?: Record<string, unknown>;
  legalScore?: number;

  // Deal terms
  dealTermsData?: Record<string, unknown>;
  dealTermsScore?: number;

  // Exit potential
  exitPotentialData?: Record<string, unknown>;
  exitPotentialScore?: number;

  // Final scores
  overallScore?: number;
  percentileRank?: number;
  keyStrengths?: string[];
  keyRisks?: string[];
  recommendations?: string[];
  dataConfidenceNotes?: string;
  executiveSummary?: string;

  // Reports
  founderReport?: FounderReport;
  investorMemo?: InvestorMemo;
  sources?: Source[];

  // Progress
  analysisProgress?: AnalysisProgress;

  createdAt: string;
  updatedAt?: string;
}
