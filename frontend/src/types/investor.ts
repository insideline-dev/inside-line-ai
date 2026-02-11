import type { FundingStage } from "./startup";

export interface InvestorProfile {
  id: string;
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
  id: string;
  userId: string;
  stages?: FundingStage[];
  checkSizeMin?: number;
  checkSizeMax?: number;
  industries?: string[];
  geographicFocus?: string[];
  geographicFocusNodes?: string[];
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
  mustHaveFeatures?: string[];
  dealBreakers?: string[];
  notes?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt?: string;
}

export interface InvestorMatch {
  id: string;
  investorId: string;
  startupId: string;
  thesisFitScore?: number;
  fitRationale?: string;
  createdAt: string;
  status: "new" | "reviewing" | "engaged" | "closed" | "passed";
  statusChangedAt?: string;
  overallScore: number;
  marketScore?: number;
  teamScore?: number;
  productScore?: number;
  tractionScore?: number;
  financialsScore?: number;
  matchReason?: string;
  isSaved: boolean;
  viewedAt?: string;
  passReason?: string;
  passNotes?: string;
  investmentAmount?: number;
  investmentCurrency?: string;
  investmentDate?: string;
  investmentNotes?: string;
  meetingRequested?: boolean;
  meetingRequestedAt?: string;
}

export interface PortalSettings {
  id: string;
  userId: string;
  name: string;
  slug: string;
  description?: string;
  logoUrl?: string;
  welcomeMessage?: string;
  tagline?: string;
  accentColor?: string;
  requiredFields?: string[];
  isActive: boolean;
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
  id: string;
  stage: FundingStage;
  weights: ScoringWeights;
  rationale: ScoringRationale;
  overallRationale?: string;
  lastModifiedBy?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface InvestorScoringPreferences {
  id: string;
  investorId: string;
  stage: FundingStage;
  useCustomWeights: boolean;
  customWeights?: ScoringWeights;
  createdAt: string;
  updatedAt?: string;
}

export interface TeamInvite {
  id: string;
  investorThesisId: string;
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
  id: string;
  investorThesisId: string;
  userId: string;
  email: string;
  role: string;
  joinedAt: string;
}
