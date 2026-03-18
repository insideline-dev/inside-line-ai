import { StartupStage } from "../../../startup/entities";

export interface MockInvestorCandidate {
  userId: string;
  thesisId: string;
  industries: string[];
  stages: string[];
  checkSizeMin: number | null;
  checkSizeMax: number | null;
  geographicFocus: string[];
  geographicFocusNodes: string[];
  thesisSummary: string | null;
  thesisNarrative: string | null;
  notes: string | null;
  isActive: boolean;
}

export function createMockInvestorCandidates(): MockInvestorCandidate[] {
  return [
    {
      userId: "investor-us-seed",
      thesisId: "thesis-us-seed",
      industries: ["software"],
      stages: [StartupStage.SEED],
      checkSizeMin: 500_000,
      checkSizeMax: 3_000_000,
      geographicFocus: ["North America"],
      geographicFocusNodes: ["l1:north_america"],
      thesisSummary: "Seed-stage industrial SaaS in North America with compliance ROI.",
      thesisNarrative:
        "Invest in early-stage workflow software with clear compliance ROI and strong operator teams.",
      notes: "High conviction on industrial digitization",
      isActive: true,
    },
    {
      userId: "investor-eu-series-a",
      thesisId: "thesis-eu-a",
      industries: ["sustainability", "financial_services"],
      stages: [StartupStage.SERIES_A],
      checkSizeMin: 3_000_000,
      checkSizeMax: 8_000_000,
      geographicFocus: ["Europe"],
      geographicFocusNodes: ["l1:europe"],
      thesisSummary: "Series A Europe-focused climate and fintech growth opportunities.",
      thesisNarrative: "Growth-stage Europe-focused sector specialist.",
      notes: null,
      isActive: true,
    },
    {
      userId: "investor-global-generalist",
      thesisId: "thesis-global-generalist",
      industries: ["software", "health_care", "artificial_intelligence"],
      stages: [StartupStage.PRE_SEED, StartupStage.SEED, StartupStage.SERIES_A],
      checkSizeMin: 250_000,
      checkSizeMax: 5_000_000,
      geographicFocus: ["Global"],
      geographicFocusNodes: ["l1:global"],
      thesisSummary: null,
      thesisNarrative:
        "Generalist fund focused on strong teams with automation and workflow defensibility.",
      notes: "Prefers evidence-driven execution",
      isActive: true,
    },
  ];
}
