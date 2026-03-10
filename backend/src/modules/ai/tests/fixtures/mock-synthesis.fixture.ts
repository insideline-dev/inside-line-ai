import type { SynthesisResult } from "../../interfaces/phase-results.interface";

export function createMockSynthesisResult(
  overrides?: Partial<SynthesisResult>,
): SynthesisResult {
  return {
    dealSnapshot:
      "Clipaf is building an AI-powered platform for industrial operations management, targeting the chronic inefficiency gap in mid-market manufacturing workflows. The company addresses a real pain point — fragmented tooling and manual coordination — with a purpose-built product that integrates directly into existing ERP systems.\n\nThe opportunity is timely given accelerating industrial digitization and recent regulatory tailwinds pushing compliance automation. Early enterprise traction and a founder team with direct domain experience position Clipaf as a credible entrant in a market underserved by legacy software vendors.",
    keyStrengths: [
      "Clear founder-market fit in industrial operations",
      "Product roadmap aligns with customer pain points",
      "Early enterprise traction supports demand validation",
    ],
    keyRisks: [
      "GTM efficiency needs stronger evidence of repeatable channel",
      "Financial assumptions require downside scenario stress-testing",
    ],
    exitScenarios: [
      {
        scenario: "conservative",
        exitType: "M&A",
        exitValuation: "$150M-$200M",
        timeline: "6-8 years",
        moic: 3.0,
        irr: 20.0,
        researchBasis: "Based on median SaaS seed M&A exits at 3-5x revenue multiple",
      },
      {
        scenario: "moderate",
        exitType: "M&A",
        exitValuation: "$400M-$600M",
        timeline: "5-7 years",
        moic: 7.5,
        irr: 32.0,
        researchBasis: "Comparable to mid-market SaaS acquisitions at 8-12x ARR",
      },
      {
        scenario: "optimistic",
        exitType: "IPO or M&A",
        exitValuation: "$1B+",
        timeline: "7-10 years",
        moic: 18.0,
        irr: 45.0,
        researchBasis: "Top-decile SaaS companies achieving $100M+ ARR with 30%+ growth",
      },
    ],
    sectionScores: {
      team: 80,
      market: 74,
      product: 82,
      traction: 72,
      businessModel: 76,
      gtm: 70,
      financials: 68,
      competitiveAdvantage: 77,
      legal: 75,
      dealTerms: 73,
      exitPotential: 76,
    },
    overallScore: 75.2,
    investorMemo: {
      executiveSummary:
        "Industrial operations management remains one of the most under-digitized segments in the mid-market. Clipaf's platform addresses the core coordination breakdown between shop floor execution and back-office planning systems — a gap that costs manufacturers an estimated 12-18% in operational inefficiency. The solution integrates natively with existing ERP infrastructure rather than replacing it, lowering adoption friction significantly. The timing is compelling: regulatory pressure around compliance documentation and a post-COVID acceleration of automation spend have created a receptive buyer environment that Clipaf is early to capture.",
      sections: [],
      keyDueDiligenceAreas: [
        "Customer expansion cohort behavior and net revenue retention",
        "Implementation scalability with channel partners",
        "Downside financial scenario modeling",
      ],
    },
    founderReport: {
      summary:
        "Your team has built a differentiated product with real enterprise validation. The core opportunity is strong — now the focus shifts to proving the GTM engine can scale repeatably.",
      whatsWorking: [
        "Secured early enterprise pilots with measurable ROI outcomes",
        "Built a product that integrates into existing workflows rather than replacing them",
        "Demonstrated domain expertise that builds customer trust quickly",
      ],
      pathToInevitability: [
        "When you show 3+ enterprise customers expanding ARR by 30%+ within 12 months",
        "Once you prove a repeatable channel partner motion with 2+ signed partners",
        "When financial model includes validated unit economics at 50-customer scale",
      ],
    },
    dataConfidenceNotes:
      "Evaluation completed with full 11/11 agent coverage.",
    ...overrides,
  };
}
