import type { FundingStage } from "./startup";

export interface InvestorProfile {
  id: number;
  userId: string;
  fundName?: string;
  fundDescription?: string;
  aum?: string;
  teamSize?: number;
  website?: string;
  logoUrl?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface InvestmentThesis {
  id: number;
  investorId: number;
  stages?: FundingStage[];
  checkSizeMin?: number;
  checkSizeMax?: number;
  sectors?: string[];
  geographies?: string[];
  businessModels?: string[];
  minRevenue?: number;
  minGrowthRate?: number;
  minTeamSize?: number;
  thesisNarrative?: string;
  antiPortfolio?: string;
  website?: string;
  fundSize?: number;
  thesisSummary?: string;
  portfolioCompanies?: { name: string; description: string }[];
  thesisSummaryGeneratedAt?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface InvestorMatch {
  id: number;
  investorId: number;
  startupId: number;
  thesisFitScore?: number;
  fitRationale?: string;
  matchedAt: string;
  status: "new" | "viewed" | "interested" | "passed";
  actionTakenAt?: string;
  notes?: string;
}

export interface PortalSettings {
  id: number;
  investorId: number;
  slug: string;
  welcomeMessage?: string;
  tagline?: string;
  accentColor?: string;
  requiredFields?: string[];
  isEnabled: boolean;
  createdAt: string;
  updatedAt?: string;
}

export interface ScoringWeights {
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

export interface ScoringRationale {
  team: string;
  market: string;
  product: string;
  traction: string;
  businessModel: string;
  gtm: string;
  financials: string;
  competitiveAdvantage: string;
  legal: string;
  dealTerms: string;
  exitPotential: string;
}

export interface StageScoringWeights {
  id: number;
  stage: FundingStage;
  weights: ScoringWeights;
  rationale: ScoringRationale;
  overallRationale?: string;
  lastModifiedBy?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface InvestorScoringPreferences {
  id: number;
  investorId: number;
  stage: FundingStage;
  useCustomWeights: boolean;
  customWeights?: ScoringWeights;
  createdAt: string;
  updatedAt?: string;
}

export interface TeamInvite {
  id: number;
  investorProfileId: number;
  invitedByUserId: string;
  email: string;
  role: string;
  status: "pending" | "accepted" | "expired" | "cancelled";
  inviteCode: string;
  expiresAt: string;
  acceptedByUserId?: string;
  acceptedAt?: string;
  createdAt: string;
}

export interface InvestorTeamMember {
  id: number;
  investorProfileId: number;
  userId: string;
  role: string;
  joinedAt: string;
}
