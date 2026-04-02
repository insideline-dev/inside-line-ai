import type { EvaluationResult } from "../../interfaces/phase-results.interface";

const base = {
  score: 78,
  confidence: "mid" as const,
  scoring: {
    overallScore: 78,
    confidence: "mid" as const,
    scoringBasis:
      "Archive-aligned mock score derived from available evidence quality.",
    subScores: [],
  },
  narrativeSummary:
    "This dimension shows solid performance with moderate confidence. The evidence supports the assessment, though additional third-party validation would strengthen the analysis.",
  keyFindings: ["Signal is acceptable"],
  strengths: ["Signal is acceptable"],
  risks: ["Evidence depth is moderate"],
  dataGaps: [
    {
      gap: "More third-party benchmarks needed",
      impact: "important" as const,
      suggestedAction: "Validate assumptions against external market data.",
    },
  ],
  sources: ["internal://pipeline-state"],
};

export function createMockEvaluationResult(
  overrides?: Partial<EvaluationResult>,
): EvaluationResult {
  const result: EvaluationResult = {
    team: {
      ...base,
      founderMarketFit: { score: 79, why: "Strong domain background" },
      teamComposition: {
        businessLeadership: true,
        technicalCapability: true,
        domainExpertise: true,
        gtmCapability: false,
        sentence: "Core leadership and technical depth are present, with a GTM gap.",
        reason: "No dedicated GTM owner yet; function covered by founders part-time.",
      },
      teamMembers: [
        {
          name: "Amina Rao",
          role: "CEO",
          relevance: "Industrial software operator with deep buyer context",
          strengths: ["Domain depth"],
          risks: [],
        },
      ],
      founderRecommendations: [],
      founderPitchRecommendations: [],
    },
    market: {
      ...base,
      marketSizing: {
        tam: {
          value: "$8.5B",
          methodology: "top-down",
          sources: [{ name: "IDC", tier: "tier_1", date: "2025", geography: "US" }],
          confidence: "mid",
        },
        sam: {
          value: "$2B",
          methodology: "Industry segment filter",
          filters: [],
          sources: [{ name: "Gartner", tier: "tier_1", date: "2025", geography: "US" }],
          confidence: "mid",
        },
        som: {
          value: "$200M",
          methodology: "Win rate model",
          assumptions: "10% capture in 5 years",
          sources: [{ name: "Internal estimate", tier: "tier_2", date: "2025", geography: "US" }],
          confidence: "low",
        },
        bottomUpSanityCheck: {
          calculation: "Not performed",
          notes: "Pending",
        },
        deckVsResearch: {
          tam: { claimed: "$8.5B", researched: "$8B", alignmentScore: null, notes: "Aligned" },
          sam: { claimed: "Unknown", researched: "Unknown", alignmentScore: null, notes: "No notes" },
          som: { claimed: "Unknown", researched: "Unknown", alignmentScore: null, notes: "No notes" },
          overallNotes: "Aligned",
        },
      },
      marketGrowthAndTiming: {
        growthRate: {
          cagr: "18%",
          period: "2024-2029",
          source: "IDC",
          deckClaimed: "20%",
          discrepancyFlag: "none",
          trajectory: "stable",
        },
        whyNow: {
          thesis: "Regulatory cycle accelerating adoption",
          supportedByResearch: true,
          evidence: ["OSHA updates"],
        },
        marketLifecycle: { position: "early_growth", evidence: "Growing vendor count" },
      },
      marketStructure: {
        structureType: "fragmented",
        concentrationTrend: { direction: "consolidating", evidence: "M&A activity rising" },
        entryConditions: [
          { factor: "Capital intensity", severity: "low", note: "Low capital barrier for SaaS" },
        ],
        tailwinds: [],
        headwinds: [],
      },
      diligenceItems: ["Validate SAM assumptions"],
      founderPitchRecommendations: [],
    },
    product: {
      ...base,
      productOverview: {
        whatItDoes: "Automates compliance workflows",
        targetUser: "Industrial operations managers",
        productCategory: "Workflow automation",
        coreValueProp: "Audit-ready outputs with minimal manual effort",
        description: "AI copilots for industrial workflows",
        techStage: "mvp",
      },
      stageFitAssessment: "on_track",
      claimsAssessment: [],
      keyFeatures: [
        { feature: "Workflow automation", verifiedBy: ["deck", "website"] },
        { feature: "Audit generation", verifiedBy: ["deck"] },
      ],
      technologyStack: [
        { technology: "TypeScript", source: "website" },
        { technology: "PostgreSQL", source: "website" },
      ],
      founderPitchRecommendations: [],
    },
    traction: {
      ...base,
      tractionOverview: {
        metricsDepth: "partial",
        stageFit: "adequate",
        hasRevenue: true,
        hasGrowthRate: true,
        hasRetention: false,
        hasUnitEconomics: false,
        hasCohortData: false,
      },
      founderPitchRecommendations: [],
    },
    businessModel: {
      ...base,
      modelOverview: {
        modelType: "SaaS",
        pricingVisible: true,
        expansionMechanism: true,
        scalabilityAssessment: "moderate",
        marginStructureDescribed: false,
      },
      founderPitchRecommendations: [],
    },
    gtm: {
      ...base,
      gtmOverview: {
        strategyType: "sales-led",
        evidenceAlignment: "partial",
        channelDiversification: false,
        scalabilityAssessment: "moderate",
      },
      founderPitchRecommendations: [],
    },
    financials: {
      ...base,
      financialModelProvided: false,
      keyMetrics: {
        raiseAmount: "$2.0M",
        monthlyBurn: null,
        runway: null,
        runwayMonths: null,
        arr: null,
        annualRecurringRevenue: null,
        grossMargin: null,
      },
      capitalPlan: {
        burnPlanDescribed: false,
        useOfFundsDescribed: true,
        runwayEstimated: false,
        raiseJustified: true,
        milestoneTied: false,
        capitalEfficiencyAddressed: false,
        milestoneAlignment: "partial",
        useOfFundsBreakdown: [],
        summary: "Use of funds is partially described.",
      },
      projections: {
        provided: false,
        assumptionsStated: false,
        internallyConsistent: false,
        credibility: "none",
        summary: "No model provided.",
        scenarioAnalysis: false,
        scenarioDetail: "Not provided",
        assumptionAssessment: "Not provided",
        assumptions: [],
        profitabilityPath: "pre-revenue",
      },
      charts: {
        revenueProjection: [],
        burnProjection: [],
        scenarioComparison: [],
        marginProgression: [],
      },
      financialPlanning: {
        sophisticationLevel: "basic",
        diligenceFlags: [],
        summary: "Planning maturity is basic.",
      },
      founderPitchRecommendations: [],
    },
    competitiveAdvantage: {
      ...base,
      strategicPositioning: {
        differentiation: "Domain workflow specialization",
        uniqueValueProposition: "Compliance automation with audit trail",
        differentiationType: "data",
        durability: "moderate",
      },
      moatAssessment: {
        moatType: "proprietary_data",
        moatStage: "forming",
        moatEvidence: ["Operational data loops"],
        selfReinforcing: true,
        timeToReplicate: "1-2 years",
      },
      barriersToEntry: {
        technical: true,
        capital: false,
        network: false,
        regulatory: true,
      },
      competitivePosition: {
        currentGap: "competitive",
        gapEvidence: "Deeper integrations than incumbents",
        vulnerabilities: ["Well-funded entrant risk"],
        defensibleAgainstFunded: true,
        defensibilityRationale: "Integration depth is hard to replicate quickly",
      },
      competitors: {
        direct: [
          {
            name: "FactoryCloud",
            description: "Industrial workflow SaaS",
          },
        ],
        indirect: [
          {
            name: "Internal ERP custom workflows",
            description: "Custom-built alternatives",
          },
        ],
        advantages: ["Deeper workflow specialization"],
        risks: ["ERP vendors can bundle adjacent functionality"],
        details: ["Current incumbents rely on manual audit processes"],
      },
      founderPitchRecommendations: [],
    },
    legal: {
      ...base,
      legalOverview: {
        redFlagsFound: false,
        redFlagCount: 0,
        redFlagDetails: [],
        complianceCertifications: [],
        regulatoryOutlook: "neutral",
        ipVerified: null,
      },
      founderPitchRecommendations: [],
    },
    dealTerms: {
      ...base,
      dealOverview: {
        impliedMultiple: null,
        comparableRange: null,
        premiumDiscount: "insufficient_data",
        roundType: "SAFE",
        raiseSizeAssessment: "typical",
        valuationProvided: false,
      },
    },
    exitPotential: {
      ...base,
      exitScenarios: [],
      returnAssessment: {
        moderateReturnsAdequate: false,
        conservativeReturnsCapital: false,
        impliedGrowthRealistic: false,
        grossReturnsDisclaimer:
          "Return analysis is directional and gross of fees, dilution, and liquidation preferences.",
      },
    },
    summary: {
      completedAgents: 11,
      failedAgents: 0,
      minimumRequired: 8,
      failedKeys: [],
      errors: [],
      fallbackAgents: 0,
      fallbackKeys: [],
      warnings: [],
      degraded: false,
    },
  };

  return {
    ...result,
    ...overrides,
  };
}
