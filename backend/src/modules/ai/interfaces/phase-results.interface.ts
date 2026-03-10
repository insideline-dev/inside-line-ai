import type { ResearchParameters } from "./research-parameters.interface";
import type {
  BusinessModelEvaluation,
  CompetitiveAdvantageEvaluation,
  DealTermsEvaluation,
  ExitPotentialEvaluation,
  FinancialsEvaluation,
  GtmEvaluation,
  LegalEvaluation,
  MarketEvaluation,
  ProductEvaluation,
  TeamEvaluation,
  TractionEvaluation,
} from "../schemas";
import type { InvestorMemo, FounderReport } from "../schemas/synthesis.schema";
import type { ExitScenario } from "../schemas/evaluations/exit-potential.schema";

export interface StartupFileReference {
  path: string;
  name: string;
  type: string;
}

export interface StartupTeamMemberReference {
  name: string;
  role?: string;
  linkedinUrl?: string;
}

export interface StartupFormContext {
  sectorIndustryGroup?: string | null;
  sectorIndustry?: string | null;
  pitchDeckPath?: string | null;
  pitchDeckUrl?: string | null;
  demoUrl?: string | null;
  logoUrl?: string | null;
  files?: StartupFileReference[];
  teamMembers?: StartupTeamMemberReference[];
  roundCurrency?: string | null;
  valuationKnown?: boolean | null;
  valuationType?: string | null;
  raiseType?: string | null;
  leadSecured?: boolean | null;
  leadInvestorName?: string | null;
  contactName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  contactPhoneCountryCode?: string | null;
  hasPreviousFunding?: boolean | null;
  previousFundingAmount?: number | null;
  previousFundingCurrency?: string | null;
  previousInvestors?: string | null;
  previousRoundType?: string | null;
  technologyReadinessLevel?: string | null;
  demoVideoUrl?: string | null;
  productDescription?: string | null;
  productScreenshots?: string[];
}

export interface ExtractionResult {
  companyName: string;
  tagline: string;
  founderNames: string[];
  industry: string;
  stage: string;
  location: string;
  website: string;
  fundingAsk?: number;
  valuation?: number;
  rawText: string;
  startupContext?: StartupFormContext;
  source?: "pdf-parse" | "pptx-parse" | "mistral-ocr" | "startup-context";
  pageCount?: number;
  warnings?: string[];
}

export interface WebsiteScrapedData {
  url: string;
  title: string;
  description: string;
  fullText: string;
  headings: string[];
  subpages: Array<{
    url: string;
    title: string;
    content: string;
  }>;
  links: Array<{
    url: string;
    text: string;
  }>;
  teamBios: Array<{
    name: string;
    role: string;
    bio: string;
    imageUrl?: string;
  }>;
  pricing?: {
    plans: Array<{ name: string; price: string; features: string[] }>;
    currency?: string;
  };
  customerLogos: string[];
  testimonials: Array<{
    quote: string;
    author: string;
    role?: string;
  }>;
  metadata: {
    scrapedAt: string;
    pageCount: number;
    hasAboutPage: boolean;
    hasTeamPage: boolean;
    hasPricingPage: boolean;
    ogImage?: string;
    keywords?: string;
    author?: string;
  };
  scrapedRoutes?: Array<{
    requestedPath: string;
    resolvedUrl: string;
    status: "ok" | "not_found" | "error";
    title?: string;
    contentLength?: number;
    error?: string;
  }>;
}

export interface EnrichedTeamMember {
  name: string;
  role?: string;
  linkedinUrl?: string;
  matchConfidence?: number;
  confidenceReason?: string;
  linkedinProfile?: {
    headline: string;
    summary: string;
    profilePictureUrl?: string;
    currentCompany?: {
      name: string;
      title: string;
    } | null;
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
      description?: string;
    }>;
  };
  teamMemberSource?: "submitted" | "website" | "linkedin" | "deck" | "enrichment";
  enrichmentStatus: "success" | "not_configured" | "not_found" | "error";
  enrichedAt?: string;
}

export interface ScrapeError {
  type: "website" | "linkedin";
  target: string;
  error: string;
}

export interface ScrapingResult {
  website?: WebsiteScrapedData | null;
  websiteUrl?: string | null;
  websiteSummary?: string;
  teamMembers: EnrichedTeamMember[];
  notableClaims: string[];
  scrapeErrors: ScrapeError[];
}

export interface SourceEntry {
  name: string;
  url?: string;
  type: "document" | "website" | "linkedin" | "api" | "search";
  agent: "team" | "market" | "product" | "news" | "competitor" | "enrichment";
  timestamp: string;
}

export interface ResearchResult {
  team: string | null;
  market: string | null;
  product: string | null;
  news: string | null;
  competitor: string | null;
  combinedReportText: string;
  sources: SourceEntry[];
  errors: Array<{ agent: "team" | "market" | "product" | "news" | "competitor"; error: string }>;
  researchParameters?: ResearchParameters;
  orchestratorGuidance?: string;
  researchFallbackSummary?: {
    attemptedAgents: number;
    fallbackAgents: number;
    fallbackRatio: number;
    criticalFallbackAgents: Array<"team" | "market" | "product">;
    warning: boolean;
  };
}

export interface EvaluationSummary {
  completedAgents: number;
  failedAgents: number;
  minimumRequired: number;
  failedKeys: EvaluationSummaryAgentKey[];
  errors: Array<{ agent: string; error: string }>;
  fallbackAgents?: number;
  fallbackKeys?: EvaluationSummaryAgentKey[];
  warnings?: Array<{
    agent: string;
    message: string;
    reason?: EvaluationFallbackReasonCode;
  }>;
  fallbackReasonCounts?: Partial<Record<EvaluationFallbackReasonCode, number>>;
  degraded: boolean;
}

export type EvaluationFallbackReasonCode =
  | "EMPTY_STRUCTURED_OUTPUT"
  | "TIMEOUT"
  | "SCHEMA_OUTPUT_INVALID"
  | "MODEL_OR_PROVIDER_ERROR"
  | "UNHANDLED_AGENT_EXCEPTION";

export type EvaluationSummaryAgentKey =
  | "team"
  | "market"
  | "product"
  | "traction"
  | "businessModel"
  | "gtm"
  | "financials"
  | "competitiveAdvantage"
  | "legal"
  | "dealTerms"
  | "exitPotential";

export interface EvaluationResult {
  team: TeamEvaluation;
  market: MarketEvaluation;
  product: ProductEvaluation;
  traction: TractionEvaluation;
  businessModel: BusinessModelEvaluation;
  gtm: GtmEvaluation;
  financials: FinancialsEvaluation;
  competitiveAdvantage: CompetitiveAdvantageEvaluation;
  legal: LegalEvaluation;
  dealTerms: DealTermsEvaluation;
  exitPotential: ExitPotentialEvaluation;
  summary: EvaluationSummary;
}

export interface EnrichmentConfidenceField<T> {
  value: T;
  confidence: number;
  source: string;
}

export interface EnrichmentDiscoveredFounder {
  name: string;
  role?: string;
  linkedinUrl?: string;
  email?: string;
  twitterUrl?: string;
  confidence: number;
}

export interface EnrichmentFundingEntry {
  round: string;
  amount?: number;
  currency?: string;
  date?: string;
  investors?: string[];
  source: string;
}

export interface EnrichmentPitchDeckUrl {
  url: string;
  source: string;
  confidence: number;
}

export interface EnrichmentSocialProfiles {
  crunchbaseUrl?: string;
  angelListUrl?: string;
  twitterUrl?: string;
  linkedinCompanyUrl?: string;
  githubUrl?: string;
}

export interface EnrichmentProductSignals {
  pricing?: string;
  customers?: string[];
  techStack?: string[];
  integrations?: string[];
}

export interface EnrichmentTractionSignals {
  employeeCount?: number;
  webTrafficEstimate?: string;
  appStoreRating?: string;
  socialFollowers?: Record<string, number>;
}

export interface EnrichmentCorrectionDetail {
  field: string;
  oldValue: string;
  newValue: string;
  confidence: number;
  reason: string;
}

export interface EnrichmentResult {
  companyName?: EnrichmentConfidenceField<string>;
  companyDescription?: EnrichmentConfidenceField<string>;
  tagline?: EnrichmentConfidenceField<string>;
  industry?: EnrichmentConfidenceField<string>;
  stage?: EnrichmentConfidenceField<string>;
  website?: EnrichmentConfidenceField<string>;
  foundingDate?: EnrichmentConfidenceField<string>;
  headquarters?: EnrichmentConfidenceField<string>;
  fundingTarget?: EnrichmentConfidenceField<number>;
  contactName?: EnrichmentConfidenceField<string>;
  contactEmail?: EnrichmentConfidenceField<string>;
  sectorIndustry?: EnrichmentConfidenceField<string>;
  sectorIndustryGroup?: EnrichmentConfidenceField<string>;
  productDescription?: EnrichmentConfidenceField<string>;
  discoveredFounders: EnrichmentDiscoveredFounder[];
  fundingHistory: EnrichmentFundingEntry[];
  pitchDeckUrls: EnrichmentPitchDeckUrl[];
  socialProfiles: EnrichmentSocialProfiles;
  productSignals: EnrichmentProductSignals;
  tractionSignals: EnrichmentTractionSignals;
  fieldsEnriched: string[];
  fieldsStillMissing: string[];
  fieldsCorrected: string[];
  correctionDetails: EnrichmentCorrectionDetail[];
  sources: Array<{ url: string; title: string; type: string }>;
  dbFieldsUpdated: string[];
  dataProvenance?: {
    fromExtraction: string[];
    fromWebsite?: string[];
    fromEmail: string[];
    fromWebSearch: string[];
    fromAiSynthesis: string[];
  };
  webSearchSkipped?: boolean;
  skipReason?: string;
  runtimeModel?: {
    promptKey: string;
    modelName: string;
    provider: string;
    searchMode: string;
    source: string;
    revisionId: string | null;
    stage: string | null;
  };
}

export interface ClaraEmailContext {
  conversations: Array<{
    investorEmail: string;
    investorName: string | null;
    messages: Array<{
      subject: string | null;
      bodyText: string | null;
      direction: string;
    }>;
  }>;
  summary: string;
}

export interface SynthesisResult {
  dealSnapshot: string;
  keyStrengths: string[];
  keyRisks: string[];
  exitScenarios: ExitScenario[];
  sectionScores: {
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
  };
  overallScore: number;
  percentileRank?: number;
  confidenceScore?: "High" | "Medium" | "Low";
  investorMemo: InvestorMemo;
  founderReport: FounderReport;
  dataConfidenceNotes: string;
  investorMemoUrl?: string;
  founderReportUrl?: string;
}
