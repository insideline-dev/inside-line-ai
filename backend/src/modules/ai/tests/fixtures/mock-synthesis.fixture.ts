import type { SynthesisResult } from "../../interfaces/phase-results.interface";

export function createMockSynthesisResult(
  overrides?: Partial<SynthesisResult>,
): SynthesisResult {
  return {
    overallScore: 79.4,
    recommendation: "Consider",
    executiveSummary:
      "Clipaf demonstrates strong product and team signals with moderate execution risk around scale-up timing.",
    strengths: [
      "Clear founder-market fit in industrial operations",
      "Product roadmap aligns with customer pain points",
      "Early enterprise traction supports demand",
    ],
    concerns: [
      "GTM efficiency needs stronger evidence",
      "Financial assumptions require downside scenarios",
    ],
    investmentThesis:
      "Invest if the team converts early enterprise traction into repeatable channel-driven growth.",
    nextSteps: [
      "Validate customer expansion cohort behavior",
      "Stress-test financial model under conservative growth",
      "Confirm implementation scalability with partners",
    ],
    confidenceLevel: "Medium",
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
    investorMemo:
      "## Investor Memo\n\nClipaf is positioned in a large industrial workflow market with early enterprise pull.",
    founderReport:
      "## Founder Report\n\nTop priority is proving scalable GTM efficiency over the next two quarters.",
    dataConfidenceNotes:
      "Evaluation completed with full 11/11 agent coverage.",
    ...overrides,
  };
}
