import type {
  BusinessModelEvaluation,
  CompetitiveAdvantageEvaluation,
  CompetitorResearch,
  DealTermsEvaluation,
  ExitPotentialEvaluation,
  FinancialsEvaluation,
  GtmEvaluation,
  LegalEvaluation,
  MarketEvaluation,
  MarketResearch,
  NewsResearch,
  ProductEvaluation,
  ProductResearch,
  TeamEvaluation,
  TeamResearch,
  TractionEvaluation,
} from "../schemas";

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
  source?: "pdf-parse" | "mistral-ocr" | "startup-context";
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
}

export interface EnrichedTeamMember {
  name: string;
  role?: string;
  linkedinUrl?: string;
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
  agent: "team" | "market" | "product" | "news" | "competitor";
  timestamp: string;
}

export interface ResearchResult {
  team: TeamResearch | null;
  market: MarketResearch | null;
  product: ProductResearch | null;
  news: NewsResearch | null;
  competitor: CompetitorResearch | null;
  sources: SourceEntry[];
  errors: Array<{ agent: "team" | "market" | "product" | "news" | "competitor"; error: string }>;
}

export interface EvaluationSummary {
  completedAgents: number;
  failedAgents: number;
  minimumRequired: number;
  failedKeys: Array<
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
    | "exitPotential"
  >;
  errors: Array<{ agent: string; error: string }>;
  degraded: boolean;
}

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

export interface SynthesisResult {
  overallScore: number;
  recommendation: "Pass" | "Consider" | "Decline";
  executiveSummary: string;
  strengths: string[];
  concerns: string[];
  investmentThesis: string;
  nextSteps: string[];
  confidenceLevel: "High" | "Medium" | "Low";
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
  investorMemo: string;
  founderReport: string;
  dataConfidenceNotes: string;
  investorMemoUrl?: string;
  founderReportUrl?: string;
}
