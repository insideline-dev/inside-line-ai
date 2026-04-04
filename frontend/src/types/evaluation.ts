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
  background?: string;
  strengths?: string[];
  concerns?: string[];
  scrapedCandidate?: boolean;
  linkedinUrl?: string;
  enrichmentStatus?: "success" | "not_configured" | "not_found" | "error";
  linkedinAnalysis?: {
    headline: string;
    summary: string;
    profilePictureUrl?: string;
    currentCompany?: { name: string; title: string } | null;
    experience: Array<{
      title: string;
      company: string;
      duration: string;
      location?: string;
      description?: string;
      startDate?: string;
      endDate?: string | null;
    }>;
    education: Array<{
      school: string;
      degree: string;
      field: string;
      startDate?: string | null;
      endDate?: string | null;
    }>;
  };
}

export interface MemoSectionSource {
  label: string;
  url: string;
}

export interface MemoSection {
  title: string;
  content: string;
  highlights?: string[];
  concerns?: string[];
  sources?: MemoSectionSource[];
}

export interface InvestorMemo {
  executiveSummary: string;
  sections: MemoSection[];
  keyDueDiligenceAreas?: string[];
}

export interface FounderReport {
  summary: string;
  whatsWorking: string[];
  pathToInevitability: string[];
}

export interface ExitScenario {
  scenario: "conservative" | "moderate" | "optimistic";
  exitType: string;
  exitValuation: string;
  timeline: string;
  moic: number;
  irr: number;
  researchBasis: string;
}

export interface Source {
  url?: string;
  title?: string;
  name?: string;
  type?: "website" | "linkedin" | "news" | "research" | string;
  category?: string;
  relevance?: string;
  agent?: string;
  model?: string;
  timestamp?: string;
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
  teamComposition?: Record<string, unknown>;
  teamScore?: number;

  // Market
  marketData?: Record<string, unknown>;
  marketScore?: number;

  // Product
  productData?: Record<string, unknown>;
  productScore?: number;
  productSummary?: string;
  extractedFeatures?: string[];

  // Traction
  tractionData?: Record<string, unknown>;
  tractionScore?: number;

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
  confidenceScore?: "High" | "Medium" | "Low";
  keyStrengths?: string[];
  keyRisks?: string[];
  dataConfidenceNotes?: string;
  executiveSummary?: string;

  // Reports
  founderReport?: FounderReport;
  investorMemo?: InvestorMemo;
  sources?: Source[];

  // Deck structured data (extracted directly from pitch deck)
  deckData?: Record<string, unknown>;

  // Exit scenarios (from deal terms agent, surfaced on summary page)
  exitScenarios?: ExitScenario[];

  // Progress
  analysisProgress?: AnalysisProgress;

  createdAt: string;
  updatedAt?: string;
}

// ---------------------------------------------------------------------------
// Typed evaluation agent output interfaces
// ---------------------------------------------------------------------------

export type EvaluationConfidence = "high" | "mid" | "medium" | "low";

// Team-specific

export interface FounderRecommendation {
  type: "hire" | "reframe";
  bullet: string;
}

export interface TeamComposition {
  businessLeadership: boolean;
  technicalCapability: boolean;
  domainExpertise: boolean;
  gtmCapability: boolean;
  sentence: string;
  reason: string;
}

export interface FounderMarketFit {
  score: number;
  why: string;
}

export interface EvaluationTeamMember {
  name: string;
  role: string;
  background: string;
  strengths: string[];
  concerns: string[];
}

export interface FounderPitchRecommendation {
  deckMissingElement: string;
  whyItMatters: string;
  recommendation: string;
}

export interface TeamEvaluationData {
  score: number;
  confidence: EvaluationConfidence;
  founderMarketFit: FounderMarketFit;
  teamComposition: TeamComposition;
  strengths: string[];
  risks: string[];
  narrativeSummary: string;
  teamMembers: EvaluationTeamMember[];
  founderRecommendations: FounderRecommendation[];
  founderPitchRecommendations: FounderPitchRecommendation[];
  keyFindings?: string[];
  dataGaps?: string[];
}

// Market types

export interface MarketSource {
  name: string;
  tier: number;
  date: string;
  value: string;
  url?: string;
}

export interface MarketSizing {
  tam: { value: string; methodology: string; sources: MarketSource[]; confidence: EvaluationConfidence };
  sam: { value: string; methodology: string; filters: string[]; sources: MarketSource[]; confidence: EvaluationConfidence };
  som: { value: string; methodology: string; assumptions: string; confidence: EvaluationConfidence };
  bottomUpSanityCheck: { calculation: string; plausible: boolean; notes: string };
  deckVsResearch: { tamClaimed: string; tamResearched: string; discrepancyFlag: boolean; discrepancyNotes: string };
}

export interface MarketGrowthAndTiming {
  growthRate: { cagr: string; period: string; source: string; deckClaimed: string; deckClaimedPeriod?: string; deckClaimedAnnualized?: string; discrepancyFlag: boolean };
  whyNow: { thesis: string; supportedByResearch: boolean; evidence: string[] };
  timingAssessment: string;
  timingRationale: string;
  marketLifecycle: { position: string; evidence: string };
}

export interface MarketStructure {
  structureType: string;
  concentrationTrend: { direction: string; evidence: string };
  entryConditions: { assessment: string; rationale: string };
  tailwinds: Array<{ factor: string; source: string; impact: string }>;
  headwinds: Array<{ factor: string; source: string; impact: string }>;
}

export interface MarketEvaluationData {
  score: number;
  confidence: EvaluationConfidence;
  marketSizing: MarketSizing;
  marketGrowthAndTiming: MarketGrowthAndTiming;
  marketStructure: MarketStructure;
  scoring?: {
    overallScore: number;
    confidence: EvaluationConfidence;
    scoringBasis: string;
  };
  narrativeSummary: string;
  dataGaps: string[];
  diligenceItems: string[];
  founderPitchRecommendations: FounderPitchRecommendation[];
  keyFindings?: string[];
  risks?: string[];
}

// Product types

export interface ProductEvaluationData {
  score: number;
  confidence: EvaluationConfidence;
  productSummary: { description: string; techStage: "mature" | "mvp" | "idea" | "scaling" };
  productOverview: { whatItDoes: string; targetUser: string; productCategory: string; coreValueProp: string };
  productStrengthsAndRisks?: { strengths: string[]; risks: string[] };
  strengths: string[];
  risks: string[];
  keyFeatures: string[];
  technologyStack: string[];
  narrativeSummary: string;
  founderPitchRecommendations: FounderPitchRecommendation[];
  keyFindings?: string[];
  dataGaps?: string[];
}

// Competitive Advantage types

export interface CompetitiveAdvantageEvaluationData {
  score: number;
  confidence: EvaluationConfidence;
  strategicPositioning: { differentiation: string; uniqueValueProposition: string; differentiationType: string; durability: string };
  moatAssessment: { moatType: string; moatStage: string; moatEvidence: string[]; selfReinforcing: boolean; timeToReplicate: string };
  barriersToEntry: { technical: boolean; capital: boolean; network: boolean; regulatory: boolean };
  competitivePosition: { currentGap: string; gapEvidence: string; vulnerabilities: string[]; defensibleAgainstFunded: boolean; defensibilityRationale: string };
  competitors: {
    direct: Array<{ name: string; description: string; url?: string; fundingRaised?: number }>;
    indirect: Array<{ name: string; description: string; whyIndirect?: string; url?: string; threatLevel?: string }>;
    advantages?: string[];
    risks?: string[];
    details?: string[];
  };
  strengths: string[];
  risks: string[];
  narrativeSummary: string;
  founderPitchRecommendations: FounderPitchRecommendation[];
  keyFindings?: string[];
  dataGaps?: string[];
}

// Simple evaluation data (traction, deal-terms, exit-potential — no recs)

export interface SimpleEvaluationData {
  score: number;
  confidence: EvaluationConfidence;
  narrativeSummary: string;
  keyFindings?: string[];
  risks?: string[];
  dataGaps?: string[];
  sources?: string[];
}

// Simple + recs (business-model, gtm, financials, legal)

export interface SimpleEvaluationWithRecsData extends SimpleEvaluationData {
  founderPitchRecommendations: FounderPitchRecommendation[];
}
