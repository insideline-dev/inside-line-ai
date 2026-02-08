import { StartupStage } from "../../../startup/entities";

export interface MockInvestorCandidate {
  userId: string;
  thesisId: string;
  industries: string[];
  stages: string[];
  checkSizeMin: number | null;
  checkSizeMax: number | null;
  geographicFocus: string[];
  thesisNarrative: string | null;
  notes: string | null;
  isActive: boolean;
}

export function createMockInvestorCandidates(): MockInvestorCandidate[] {
  return [
    {
      userId: "investor-us-seed",
      thesisId: "thesis-us-seed",
      industries: ["Industrial SaaS", "B2B SaaS"],
      stages: [StartupStage.SEED],
      checkSizeMin: 500_000,
      checkSizeMax: 3_000_000,
      geographicFocus: ["us", "global"],
      thesisNarrative:
        "Invest in early-stage workflow software with clear compliance ROI and strong operator teams.",
      notes: "High conviction on industrial digitization",
      isActive: true,
    },
    {
      userId: "investor-eu-series-a",
      thesisId: "thesis-eu-a",
      industries: ["Climate", "Fintech"],
      stages: [StartupStage.SERIES_A],
      checkSizeMin: 3_000_000,
      checkSizeMax: 8_000_000,
      geographicFocus: ["europe"],
      thesisNarrative: "Growth-stage Europe-focused sector specialist.",
      notes: null,
      isActive: true,
    },
    {
      userId: "investor-global-generalist",
      thesisId: "thesis-global-generalist",
      industries: ["Industrial SaaS", "Healthcare", "AI"],
      stages: [StartupStage.PRE_SEED, StartupStage.SEED, StartupStage.SERIES_A],
      checkSizeMin: 250_000,
      checkSizeMax: 5_000_000,
      geographicFocus: ["global"],
      thesisNarrative:
        "Generalist fund focused on strong teams with automation and workflow defensibility.",
      notes: "Prefers evidence-driven execution",
      isActive: true,
    },
  ];
}
