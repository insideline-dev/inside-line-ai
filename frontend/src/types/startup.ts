export type StartupStatus = "draft" | "submitted" | "analyzing" | "pending_review" | "approved" | "rejected";
export type PrivateInvestorPipelineStatus = "new" | "reviewing" | "engaged" | "closed" | "passed";

export type FundingStage = "pre_seed" | "seed" | "series_a" | "series_b" | "series_c" | "series_d" | "series_e" | "series_f_plus";

export type TechnologyReadinessLevel = "idea" | "mvp" | "scaling" | "mature";

export type RaiseType = "safe" | "convertible_note" | "equity" | "safe_equity" | "undecided";

export type ValuationType = "pre_money" | "post_money";

export interface TeamMember {
  name: string;
  role: string;
  linkedinUrl?: string;
}

export interface StartupFile {
  path: string;
  name: string;
  type: string;
}

export interface Startup {
  id: string;
  userId: string;
  slug: string;
  submittedByRole: "founder" | "investor" | "admin" | "scout";
  scoutId?: string;
  isPrivate: boolean;
  name: string;
  tagline: string;
  website?: string;
  logoUrl?: string;
  pitchDeckUrl?: string;
  pitchDeckPath?: string;
  files?: StartupFile[];
  teamMembers?: TeamMember[];
  description?: string;
  industry?: string;
  teamSize?: number;
  stage?: FundingStage;
  sectorIndustryGroup?: string;
  sectorIndustry?: string;
  location?: string;
  normalizedRegion?: string;
  fundingTarget?: number;
  roundCurrency?: string;
  valuation?: number;
  valuationKnown?: boolean;
  valuationType?: ValuationType;
  raiseType?: RaiseType;
  leadSecured?: boolean;
  leadInvestorName?: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  contactPhoneCountryCode?: string;
  hasPreviousFunding?: boolean;
  previousFundingAmount?: number;
  previousFundingCurrency?: string;
  previousInvestors?: string;
  previousRoundType?: string;
  status: StartupStatus;
  privateInvestorPipelineStatus?: PrivateInvestorPipelineStatus | null;
  submittedAt?: string;
  approvedAt?: string;
  rejectedAt?: string;
  rejectionReason?: string;
  overallScore?: number;
  percentileRank?: number;
  productDescription?: string;
  technologyReadinessLevel?: TechnologyReadinessLevel;
  productScreenshots?: string[];
  demoVideoUrl?: string;
  demoUrl?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface StartupDraft {
  id: string;
  userId: string;
  startupId: string;
  draftData: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface StartupFormData {
  // Company basics
  name: string;
  tagline: string;
  website: string;
  description: string;
  location: string;

  // Industry & stage
  industry: string;
  sectorIndustryGroup: string;
  sectorIndustry: string;
  stage: FundingStage;
  technologyReadinessLevel: TechnologyReadinessLevel;

  // Team
  teamMembers: TeamMember[];
  teamSize: number;

  // Deal terms
  fundingTarget: number;
  roundCurrency: string;
  valuation?: number;
  valuationKnown: boolean;
  valuationType?: ValuationType;
  raiseType: RaiseType;
  leadSecured: boolean;
  leadInvestorName?: string;

  // Contact
  contactName: string;
  contactEmail: string;
  contactPhone?: string;
  contactPhoneCountryCode?: string;

  // Previous funding
  hasPreviousFunding: boolean;
  previousFundingAmount?: number;
  previousFundingCurrency?: string;
  previousInvestors?: string;
  previousRoundType?: string;

  // Product
  productDescription?: string;
  demoVideoUrl?: string;
}

export interface StartupWithEvaluation extends Startup {
  evaluation?: Evaluation;
}

// Re-export Evaluation type for convenience
import type { Evaluation } from "./evaluation";
export type { Evaluation };
