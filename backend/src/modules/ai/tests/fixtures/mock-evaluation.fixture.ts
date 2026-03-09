import type { EvaluationResult } from "../../interfaces/phase-results.interface";

export function createMockEvaluationResult(
  overrides?: Partial<EvaluationResult>,
): EvaluationResult {
  const base = {
    score: 78,
    confidence: "mid" as const,
    narrativeSummary:
      "This dimension shows solid performance with moderate confidence. The evidence supports the assessment, though additional third-party validation would strengthen the analysis.",
    keyFindings: ["Signal is acceptable"],
    risks: ["Evidence depth is moderate"],
    dataGaps: ["More third-party benchmarks needed"],
    sources: ["internal://pipeline-state"],
  };

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
      strengths: ["Domain depth", "Operator-founder profile"],
      teamMembers: [
        {
          name: "Amina Rao",
          role: "CEO",
          background: "Industrial software operator",
          strengths: ["Domain depth"],
          concerns: [],
        },
      ],
      founderRecommendations: [],
      founderPitchRecommendations: [],
    },
    market: {
      ...base,
      marketSizing: {
        tam: { value: "$8.5B", methodology: "top-down", sources: [], confidence: "mid" },
        sam: { value: "$2B", methodology: "Industry segment filter", filters: [], sources: [], confidence: "mid" },
        som: { value: "$200M", methodology: "Win rate model", assumptions: "10% capture in 5 years", confidence: "low" },
        bottomUpSanityCheck: { calculation: "Not performed", plausible: false, notes: "Pending" },
        deckVsResearch: { tamClaimed: "$8.5B", tamResearched: "$8B", discrepancyFlag: false, discrepancyNotes: "Aligned" },
      },
      marketGrowthAndTiming: {
        growthRate: { cagr: "18%", period: "2024-2029", source: "IDC", deckClaimed: "20%", discrepancyFlag: false },
        whyNow: { thesis: "Regulatory cycle accelerating adoption", supportedByResearch: true, evidence: ["OSHA updates"] },
        timingAssessment: "right_time",
        timingRationale: "Favorable regulatory and tooling cycle",
        marketLifecycle: { position: "early_growth", evidence: "Growing vendor count" },
      },
      marketStructure: {
        structureType: "fragmented",
        concentrationTrend: { direction: "consolidating", evidence: "M&A activity rising" },
        entryConditions: { assessment: "favorable", rationale: "Low capital barrier for SaaS" },
        tailwinds: [],
        headwinds: [],
      },
      scoring: {
        overallScore: 74,
        confidence: "mid",
        scoringBasis: "Scored on TAM quality, timing evidence, and structure favorability.",
      },
      diligenceItems: ["Validate SAM assumptions"],
      founderPitchRecommendations: [],
    },
    product: {
      ...base,
      productSummary: { description: "AI copilots for industrial workflows", techStage: "mvp" },
      productOverview: {
        whatItDoes: "Automates compliance workflows",
        targetUser: "Industrial operations managers",
        productCategory: "Workflow automation",
        coreValueProp: "Audit-ready outputs with minimal manual effort",
      },
      productStrengthsAndRisks: {
        strengths: ["Clear workflow automation wedge", "Strong compliance narrative"],
        risks: ["Depth of integrations not fully demonstrated"],
      },
      strengths: ["Compliance automation", "Audit generation"],
      keyFeatures: ["Workflow automation", "Audit generation"],
      technologyStack: ["TypeScript", "PostgreSQL"],
      founderPitchRecommendations: [],
    },
    traction: {
      ...base,
    },
    businessModel: {
      ...base,
      founderPitchRecommendations: [],
    },
    gtm: {
      ...base,
      founderPitchRecommendations: [],
    },
    financials: {
      ...base,
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
        timeToReplicate: "2-3 years",
      },
      barriersToEntry: { technical: true, capital: false, network: false, regulatory: true },
      competitivePosition: {
        currentGap: "widening",
        gapEvidence: "Deeper integrations than incumbents",
        vulnerabilities: ["Well-funded entrant risk"],
        defensibleAgainstFunded: true,
        defensibilityRationale: "Integration depth is hard to replicate quickly",
      },
      competitors: {
        direct: [{ name: "FactoryCloud", description: "Industrial workflow SaaS" }],
        indirect: [{ name: "Internal ERP custom workflows", description: "Custom-built alternatives" }],
        advantages: ["Deeper workflow specialization"],
        risks: ["ERP vendors can bundle adjacent functionality"],
        details: ["Current incumbents rely on manual audit processes"],
      },
      strengths: ["Integration depth", "Operational data loops"],
      founderPitchRecommendations: [],
    },
    legal: {
      ...base,
      founderPitchRecommendations: [],
    },
    dealTerms: {
      ...base,
    },
    exitPotential: {
      ...base,
      exitScenarios: [],
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
