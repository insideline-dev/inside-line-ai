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
  /** @deprecated DG-E11-F1-S1: use FundingHistoryRow[] from the funding-history endpoint */
  hasPreviousFunding?: boolean;
  /** @deprecated DG-E11-F1-S1: use FundingHistoryRow.amount */
  previousFundingAmount?: number;
  /** @deprecated DG-E11-F1-S1: use FundingHistoryRow.currency */
  previousFundingCurrency?: string;
  /** @deprecated DG-E11-F1-S1: use FundingHistoryRow.investors */
  previousInvestors?: string;
  /** @deprecated DG-E11-F1-S1: use FundingHistoryRow.roundType */
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

/**
 * Provenance entry for a single funding-history source. Mirrors
 * `FundingHistorySourceEntry` in the backend Drizzle schema. Each row in
 * `FundingHistoryRow.sources` represents one provider that reported the
 * round; if its values disagreed with the canonical merged values, the
 * disagreeing fields appear in `conflictsWith`.
 */
export interface FundingHistorySource {
  provider: "crunchbase" | "public_filing" | "press_release";
  sourceUrl: string;
  fetchedAt: string;
  reportedAmount?: number | null;
  reportedCurrency?: string | null;
  reportedAnnouncedAt?: string | null;
  reportedLeadInvestor?: string | null;
  conflictsWith?: string[];
}

/**
 * One canonical funding round persisted for a startup. Powered by the
 * `startup_funding_history` table — see DG-E11-F1-S1. Replaces the
 * deprecated flat `previousFunding*` fields on `Startup`.
 */
export interface FundingHistoryRow {
  id: string;
  startupId: string;
  roundType: string;
  announcedAt: string | null;
  /** Numeric values are returned as strings by Drizzle (numeric type). */
  amount: string | null;
  currency: string | null;
  valuationPostMoney: string | null;
  leadInvestor: string | null;
  investors: string[] | null;
  sources: FundingHistorySource[];
  evidenceConfidence: string | null;
  lastReconciledAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface FundingHistoryListResponse {
  startupId: string;
  rows: FundingHistoryRow[];
  /** True when the backend found no canonical match — drives empty UI. */
  empty: boolean;
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
