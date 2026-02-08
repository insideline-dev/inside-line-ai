import type { InvestmentThesis, PortalSettings, InvestorMatch, StageScoringWeights, FundingStage } from "@/types";
import { mockStageScoringWeights, getMockScoringWeightsByStage } from "../data/scoring-weights";
import { mockStartups } from "../data/startups";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Mock investor data
let mockThesis: InvestmentThesis = {
  id: "1",
  userId: "1",
  stages: ["seed", "series_a"],
  checkSizeMin: 500000,
  checkSizeMax: 3000000,
  industries: ["software", "artificial_intelligence", "financial_services"],
  geographicFocus: ["North America", "Europe"],
  businessModels: ["B2B SaaS", "Marketplace"],
  minRevenue: 100000,
  minGrowthRate: 15,
  minTeamSize: 2,
  thesisNarrative: "We invest in early-stage B2B SaaS and AI companies with strong technical founders.",
  antiPortfolio: "Consumer apps, Hardware, Crypto",
  fundSize: 50000000,
  thesisSummary: "Early-stage B2B SaaS and AI focus with emphasis on technical founding teams.",
  portfolioCompanies: [
    { name: "DataCo", description: "Data infrastructure" },
    { name: "AIFlow", description: "AI workflow automation" },
  ],
  isActive: true,
  createdAt: "2024-01-01T00:00:00Z",
  updatedAt: "2024-06-01T00:00:00Z",
};

let mockPortal: PortalSettings = {
  id: "1",
  userId: "1",
  slug: "venture-capital-partners",
  name: "Venture Capital Partners",
  welcomeMessage: "Submit your startup for consideration by our investment team.",
  tagline: "Backing bold founders building the future",
  accentColor: "#6366f1",
  requiredFields: ["name", "website", "description", "stage", "teamMembers"],
  isEnabled: true,
  isActive: true,
  createdAt: "2024-01-01T00:00:00Z",
  updatedAt: "2024-06-01T00:00:00Z",
};

const mockMatches: InvestorMatch[] = [
  {
    id: "1",
    investorId: "1",
    startupId: "1",
    thesisFitScore: 85,
    fitRationale: "Strong fit with B2B SaaS thesis, experienced team, good traction",
    overallScore: 82,
    isSaved: false,
    createdAt: "2024-06-20T10:00:00Z",
    status: "reviewing",
  },
  {
    id: "2",
    investorId: "1",
    startupId: "5",
    thesisFitScore: 72,
    fitRationale: "AI focus aligns well, though healthcare vertical is new for fund",
    overallScore: 88,
    isSaved: false,
    createdAt: "2024-06-15T10:00:00Z",
    status: "reviewing",
  },
];

export const mockInvestorService = {
  // Thesis
  async getThesis(): Promise<InvestmentThesis> {
    await delay(200);
    return mockThesis;
  },

  async saveThesis(data: Partial<InvestmentThesis>): Promise<InvestmentThesis> {
    await delay(300);
    mockThesis = { ...mockThesis, ...data, updatedAt: new Date().toISOString() };
    return mockThesis;
  },

  // Portal
  async getPortal(): Promise<PortalSettings> {
    await delay(200);
    return mockPortal;
  },

  async savePortal(data: Partial<PortalSettings>): Promise<PortalSettings> {
    await delay(300);
    mockPortal = { ...mockPortal, ...data, updatedAt: new Date().toISOString() };
    return mockPortal;
  },

  async checkSlugAvailability(slug: string): Promise<boolean> {
    await delay(100);
    // In mock, only our own slug is taken
    return slug !== mockPortal.slug;
  },

  // Matches
  async getMatches(): Promise<(InvestorMatch & { startup: typeof mockStartups[0] })[]> {
    await delay(200);
    return mockMatches.map((match) => ({
      ...match,
      startup: mockStartups.find((s) => s.id === match.startupId)!,
    }));
  },

  async updateMatchStatus(matchId: string, status: InvestorMatch["status"]): Promise<InvestorMatch> {
    await delay(200);
    const match = mockMatches.find((m) => m.id === matchId);
    if (!match) throw new Error("Match not found");
    match.status = status;
    match.statusChangedAt = new Date().toISOString();
    return match;
  },

  // Scoring weights
  async getScoringWeights(): Promise<StageScoringWeights[]> {
    await delay(150);
    return mockStageScoringWeights;
  },

  async getScoringWeightsByStage(stage: FundingStage): Promise<StageScoringWeights | null> {
    await delay(100);
    return getMockScoringWeightsByStage(stage) ?? null;
  },

  // Stats
  async getStats() {
    await delay(150);
    return {
      totalMatches: mockMatches.length,
      newMatches: mockMatches.filter((m) => m.status === "new").length,
      engaged: mockMatches.filter((m) => m.status === "engaged").length,
      avgFitScore: mockMatches.reduce((acc, m) => acc + (m.thesisFitScore || 0), 0) / mockMatches.length,
    };
  },
};
