import type { EvaluationResult } from "../../interfaces/phase-results.interface";

export function createMockEvaluationResult(
  overrides?: Partial<EvaluationResult>,
): EvaluationResult {
  const base = {
    score: 78,
    confidence: 0.78,
    feedback:
      "This dimension shows solid performance with moderate confidence. The evidence supports the assessment, though additional third-party validation would strengthen the analysis. Overall, the signals align with stage-appropriate expectations and demonstrate reasonable progress toward key milestones.",
    keyFindings: ["Signal is acceptable"],
    risks: ["Evidence depth is moderate"],
    dataGaps: ["More third-party benchmarks needed"],
    sources: ["internal://pipeline-state"],
  };

  const result: EvaluationResult = {
    team: {
      ...base,
      founderQuality: "Strong operator-founder profile",
      teamCompletion: 76,
      executionCapability: "Good execution cadence",
      founderMarketFitScore: 79,
      teamMembers: [
        {
          name: "Amina Rao",
          role: "CEO",
          background: "Industrial software operator",
          strengths: ["Domain depth"],
          concerns: [],
        },
      ],
    },
    market: {
      ...base,
      marketSize: "Large and growing regulated operations market",
      marketGrowth: "Sustained digital transformation tailwinds",
      tamEstimate: 8_500_000_000,
      marketTiming: "Favorable regulatory and tooling cycle",
      credibilityScore: 74,
      directCompetitors: ["FactoryCloud", "OpsPilot"],
      indirectCompetitors: ["Internal ERP custom workflows"],
      directCompetitorsDetailed: [],
      indirectCompetitorsDetailed: [],
    },
    product: {
      ...base,
      productDescription: "AI copilots for industrial workflows",
      uniqueValue: "Compliance automation with audit-ready outputs",
      technologyStack: ["TypeScript", "PostgreSQL"],
      keyFeatures: ["Workflow automation", "Audit generation"],
      productMaturity: "seed",
    },
    traction: {
      ...base,
      metrics: {
        users: 420,
        revenue: 480000,
        growthRatePct: 11,
      },
      customerValidation: "Early enterprise logos and pilots",
      growthTrajectory: "Steady quarter-over-quarter expansion",
      revenueModel: "Subscription + expansion seats",
    },
    businessModel: {
      ...base,
      revenueStreams: ["Subscription", "Implementation"],
      unitEconomics: "Unit economics improving with deployment scale",
      scalability: "Scales with partner enablement",
      defensibility: "Process know-how and integrations",
    },
    gtm: {
      ...base,
      customerSegments: ["Mid-market", "Enterprise"],
      acquisitionChannels: ["Founder-led sales", "Partners"],
      salesStrategy: "Land-and-expand through compliance teams",
      pricingStrategy: "Tiered annual contracts",
    },
    financials: {
      ...base,
      burnRate: 125000,
      runway: 18,
      fundingHistory: [],
      financialHealth: "Healthy for current stage",
    },
    competitiveAdvantage: {
      ...base,
      moats: ["Domain workflow specialization"],
      competitivePosition: "Strong category entrant",
      barriers: ["Integration depth", "Operational data loops"],
      directCompetitors: ["FactoryCloud", "OpsPilot"],
      indirectCompetitors: ["Internal ERP custom workflows"],
      directCompetitorsDetailed: [],
      indirectCompetitorsDetailed: [],
    },
    legal: {
      ...base,
      ipStatus: "No blocking IP concerns surfaced",
      regulatoryRisks: ["Regional compliance variance"],
      legalStructure: "Standard venture-friendly structure",
    },
    dealTerms: {
      ...base,
      valuation: 12_000_000,
      askAmount: 2_500_000,
      equity: 15,
      termsQuality: "Within current market ranges",
    },
    exitPotential: {
      ...base,
      exitScenarios: ["Strategic acquisition"],
      acquirers: ["Industrial software incumbents"],
      exitTimeline: "5-7 years",
      returnPotential: "Venture-scale if GTM efficiency sustains",
    },
    summary: {
      completedAgents: 11,
      failedAgents: 0,
      minimumRequired: 8,
      failedKeys: [],
      errors: [],
      degraded: false,
    },
  };

  return {
    ...result,
    ...overrides,
  };
}
