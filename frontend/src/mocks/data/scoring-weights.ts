import type { StageScoringWeights, ScoringWeights, ScoringRationale, FundingStage } from "@/types";

const defaultRationale: ScoringRationale = {
  team: "Team quality and experience",
  market: "Market size and growth potential",
  product: "Product differentiation and technology",
  traction: "Revenue, users, and growth metrics",
  businessModel: "Unit economics and scalability",
  gtm: "Go-to-market strategy and execution",
  financials: "Financial health and projections",
  competitiveAdvantage: "Moats and defensibility",
  legal: "Legal structure and IP",
  dealTerms: "Valuation and deal terms",
  exitPotential: "Exit opportunities and timeline",
};

export const mockStageScoringWeights: StageScoringWeights[] = [
  {
    id: "1",
    stage: "pre_seed",
    weights: {
      team: 30,
      market: 20,
      product: 15,
      traction: 5,
      businessModel: 10,
      gtm: 5,
      financials: 2,
      competitiveAdvantage: 5,
      legal: 3,
      dealTerms: 3,
      exitPotential: 2,
    },
    rationale: {
      ...defaultRationale,
      team: "At pre-seed, team is the primary indicator of success potential",
      traction: "Minimal traction expected at this stage",
    },
    overallRationale: "Pre-seed focuses heavily on team quality as product and traction are still forming",
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-01T00:00:00Z",
  },
  {
    id: "2",
    stage: "seed",
    weights: {
      team: 25,
      market: 18,
      product: 18,
      traction: 12,
      businessModel: 10,
      gtm: 5,
      financials: 3,
      competitiveAdvantage: 4,
      legal: 2,
      dealTerms: 2,
      exitPotential: 1,
    },
    rationale: {
      ...defaultRationale,
      traction: "Some early traction signals expected",
      product: "Product should show clear differentiation",
    },
    overallRationale: "Seed stage balances team strength with early product-market fit signals",
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-01T00:00:00Z",
  },
  {
    id: "3",
    stage: "series_a",
    weights: {
      team: 18,
      market: 15,
      product: 15,
      traction: 20,
      businessModel: 12,
      gtm: 8,
      financials: 5,
      competitiveAdvantage: 3,
      legal: 2,
      dealTerms: 1,
      exitPotential: 1,
    },
    rationale: {
      ...defaultRationale,
      traction: "Strong traction signals required for Series A",
      businessModel: "Unit economics should be improving",
    },
    overallRationale: "Series A emphasizes proven traction and business model validation",
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-01T00:00:00Z",
  },
  {
    id: "4",
    stage: "series_b",
    weights: {
      team: 12,
      market: 12,
      product: 12,
      traction: 22,
      businessModel: 15,
      gtm: 10,
      financials: 8,
      competitiveAdvantage: 4,
      legal: 2,
      dealTerms: 2,
      exitPotential: 1,
    },
    rationale: {
      ...defaultRationale,
      traction: "Consistent growth trajectory expected",
      financials: "Clear path to profitability",
    },
    overallRationale: "Series B focuses on scaling proven models with strong financials",
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-01T00:00:00Z",
  },
  {
    id: "5",
    stage: "series_c",
    weights: {
      team: 8,
      market: 10,
      product: 10,
      traction: 20,
      businessModel: 15,
      gtm: 10,
      financials: 12,
      competitiveAdvantage: 5,
      legal: 3,
      dealTerms: 4,
      exitPotential: 3,
    },
    rationale: {
      ...defaultRationale,
      financials: "Strong financial performance required",
      exitPotential: "Exit timeline becomes more relevant",
    },
    overallRationale: "Series C and beyond focus on financial performance and exit potential",
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-01T00:00:00Z",
  },
];

export function getMockScoringWeightsByStage(stage: FundingStage): StageScoringWeights | undefined {
  return mockStageScoringWeights.find((w) => w.stage === stage);
}

export function getMockDefaultWeights(): ScoringWeights {
  return mockStageScoringWeights.find((w) => w.stage === "seed")!.weights;
}
