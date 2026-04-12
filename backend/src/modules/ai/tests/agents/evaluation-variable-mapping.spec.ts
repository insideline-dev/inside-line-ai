import { describe, expect, it, jest } from "bun:test";
import { TeamEvaluationAgent } from "../../agents/evaluation/team-evaluation.agent";
import { MarketEvaluationAgent } from "../../agents/evaluation/market-evaluation.agent";
import { ProductEvaluationAgent } from "../../agents/evaluation/product-evaluation.agent";
import { TractionEvaluationAgent } from "../../agents/evaluation/traction-evaluation.agent";
import { BusinessModelEvaluationAgent } from "../../agents/evaluation/business-model-evaluation.agent";
import { GtmEvaluationAgent } from "../../agents/evaluation/gtm-evaluation.agent";
import { FinancialsEvaluationAgent } from "../../agents/evaluation/financials-evaluation.agent";
import { CompetitiveAdvantageEvaluationAgent } from "../../agents/evaluation/competitive-advantage-evaluation.agent";
import { LegalEvaluationAgent } from "../../agents/evaluation/legal-evaluation.agent";
import { DealTermsEvaluationAgent } from "../../agents/evaluation/deal-terms-evaluation.agent";
import { ExitPotentialEvaluationAgent } from "../../agents/evaluation/exit-potential-evaluation.agent";
import type { AiProviderService } from "../../providers/ai-provider.service";
import type { AiConfigService } from "../../services/ai-config.service";
import type { AiPromptService } from "../../services/ai-prompt.service";
import { MarketEvaluationSchema } from "../../schemas";
import {
  EVALUATION_PROMPT_KEY_BY_AGENT,
  AI_PROMPT_CATALOG,
} from "../../services/ai-prompt-catalog";
import type { EvaluationAgentKey } from "../../interfaces/agent.interface";
import { createEvaluationPipelineInput } from "../fixtures/evaluation-pipeline.fixture";

/* ------------------------------------------------------------------ */
/*  Minimal mocks                                                      */
/* ------------------------------------------------------------------ */

const providers = {} as unknown as AiProviderService;
const aiConfig = {} as unknown as AiConfigService;
const promptService = {
  resolve: jest.fn(),
  renderTemplate: (template: string, vars: Record<string, string>) => {
    return template.replace(
      /{{\s*([a-zA-Z0-9_]+)\s*}}/g,
      (_, name: string) => {
        const value = vars[name];
        if (value === null || value === undefined) return "";
        return String(value);
      },
    );
  },
} as unknown as AiPromptService;

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

type AgentInstance = {
  key: EvaluationAgentKey;
  buildContext: (data: ReturnType<typeof createEvaluationPipelineInput>) => Record<string, unknown>;
  /** protected → access via cast */
};

function makeAgent(
  AgentClass: new (
    p: AiProviderService,
    c: AiConfigService,
    ps: AiPromptService,
  ) => AgentInstance,
): AgentInstance {
  return new AgentClass(providers, aiConfig, promptService);
}

const ALL_AGENTS = [
  TeamEvaluationAgent,
  MarketEvaluationAgent,
  ProductEvaluationAgent,
  TractionEvaluationAgent,
  BusinessModelEvaluationAgent,
  GtmEvaluationAgent,
  FinancialsEvaluationAgent,
  CompetitiveAdvantageEvaluationAgent,
  LegalEvaluationAgent,
  DealTermsEvaluationAgent,
  ExitPotentialEvaluationAgent,
] as unknown as Array<
  new (p: AiProviderService, c: AiConfigService, ps: AiPromptService) => AgentInstance
>;

const COMMON_VARIABLE_KEYS = [
  "contextSections",
  "contextJson",
  "companyName",
  "companyDescription",
  "sector",
  "stage",
  "website",
  "location",
  "deckContext",
  "adminGuidance",
  "webResearch",
  "websiteContent",
];

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe("Evaluation variable mapping", () => {
  const pipelineData = createEvaluationPipelineInput();

  describe("buildCommonTemplateVariables populates all common keys", () => {
    for (const AgentClass of ALL_AGENTS) {
      const agent = makeAgent(AgentClass) as unknown as {
        key: EvaluationAgentKey;
        buildCommonTemplateVariables: (
          d: typeof pipelineData,
          notes: Array<{ scope: string; feedback: string }>,
        ) => Record<string, string>;
      };

      it(`${agent.key}: common vars are non-empty strings`, () => {
        const vars = agent.buildCommonTemplateVariables(pipelineData, []);
        for (const key of COMMON_VARIABLE_KEYS) {
          if (key === "contextSections" || key === "contextJson") continue; // injected at run()
          expect(typeof vars[key]).toBe("string");
          expect(vars[key].length).toBeGreaterThan(0);
        }
      });
    }
  });

  describe("getAgentTemplateVariables returns expected keys", () => {
    const expectations: Record<EvaluationAgentKey, string[]> = {
      team: ["teamMembersData", "teamResearchOutput"],
      market: [
        "marketResearchOutput",
        "claimedTAM",
        "claimedSAM",
        "claimedSOM",
        "claimedGrowthRate",
        "claimedGrowthRatePeriod",
        "targetMarketDescription",
      ],
      product: ["productResearchOutput"],
      traction: ["deckTractionData"],
      businessModel: [],
      gtm: [],
      financials: [
        "valuation",
        "valuationType",
        "roundSize",
        "roundCurrency",
        "financialModel",
      ],
      competitiveAdvantage: [
        "marketResearchOutput",
        "productResearchOutput",
        "competitorProfiles",
        "featureMatrix",
        "competitiveDynamicsEvidence",
      ],
      legal: [
        "teamResearchOutput",
        "productResearchOutput",
        "newsResearchOutput",
      ],
      dealTerms: [
        "competitorResearchOutput",
        "newsResearchOutput",
        "roundSize",
        "roundCurrency",
        "valuation",
        "valuationType",
        "raiseType",
        "leadSecured",
        "leadInvestorName",
        "hasPreviousFunding",
        "previousFundingAmount",
        "previousFundingCurrency",
        "previousInvestors",
        "previousRoundType",
      ],
      exitPotential: [
        "marketResearchOutput",
        "competitorResearchOutput",
        "newsResearchOutput",
        "valuation",
        "valuationType",
        "roundSize",
        "roundCurrency",
      ],
    };

    for (const AgentClass of ALL_AGENTS) {
      const agent = makeAgent(AgentClass) as unknown as {
        key: EvaluationAgentKey;
        getAgentTemplateVariables: (
          d: typeof pipelineData,
        ) => Record<string, string>;
      };

      it(`${agent.key}: returns exactly the expected variable keys`, () => {
        const vars = agent.getAgentTemplateVariables(pipelineData);
        const expected = expectations[agent.key];
        expect(Object.keys(vars).sort()).toEqual([...expected].sort());
      });

      it(`${agent.key}: all variable values are strings (not undefined/null)`, () => {
        const vars = agent.getAgentTemplateVariables(pipelineData);
        for (const [, value] of Object.entries(vars)) {
          expect(typeof value).toBe("string");
          expect(value).not.toBe("");
          // Ensure no leftover {{}} in values
          expect(value).not.toMatch(/{{\s*[a-zA-Z0-9_]+\s*}}/);
        }
      });
    }
  });

  it("uses explicit deck market growth for claimedGrowthRate instead of company growth text", () => {
    const pipelineData = createEvaluationPipelineInput();
    pipelineData.extraction.rawText = [
      "Clipaf has 35% month-over-month revenue growth.",
      "The workflow automation market is expanding quickly.",
    ].join("\n");
    pipelineData.extraction.deckStructuredData = {
      market: {
        marketGrowthRate: "22% CAGR",
      },
    } as unknown as typeof pipelineData.extraction.deckStructuredData;

    const agent = new MarketEvaluationAgent(providers, aiConfig, promptService) as unknown as {
      getAgentTemplateVariables: (data: typeof pipelineData) => Record<string, string>;
    };

    const vars = agent.getAgentTemplateVariables(pipelineData);
    expect(vars.claimedGrowthRate).toBe("22% CAGR");
  });

  it("does not treat company growth text as claimed market growth when market evidence is missing", () => {
    const pipelineData = createEvaluationPipelineInput();
    pipelineData.extraction.rawText = [
      "Clipaf has 35% month-over-month revenue growth.",
      "The company grew 120% year-over-year.",
    ].join("\n");
    pipelineData.extraction.deckStructuredData = undefined;
    pipelineData.research.market = "Market report text focused on compliance tailwinds and buyer urgency.";

    const agent = new MarketEvaluationAgent(providers, aiConfig, promptService) as unknown as {
      getAgentTemplateVariables: (data: typeof pipelineData) => Record<string, string>;
    };

    const vars = agent.getAgentTemplateVariables(pipelineData);
    expect(vars.claimedGrowthRate).toBe("Not provided");
  });

  describe("agent variables match catalog allowedVariables", () => {
    for (const AgentClass of ALL_AGENTS) {
      const agent = makeAgent(AgentClass) as unknown as {
        key: EvaluationAgentKey;
        getAgentTemplateVariables: (
          d: typeof pipelineData,
        ) => Record<string, string>;
        buildCommonTemplateVariables: (
          d: typeof pipelineData,
          notes: Array<{ scope: string; feedback: string }>,
        ) => Record<string, string>;
      };

      it(`${agent.key}: produced variables are subset of catalog allowedVariables`, () => {
        const commonVars = agent.buildCommonTemplateVariables(pipelineData, []);
        const agentVars = agent.getAgentTemplateVariables(pipelineData);
        const producedKeys = new Set([
          ...Object.keys(commonVars),
          ...Object.keys(agentVars),
          "contextSections",
          "contextJson",
        ]);

        const promptKey = EVALUATION_PROMPT_KEY_BY_AGENT[agent.key];
        const catalogEntry = AI_PROMPT_CATALOG[promptKey];
        const allowedSet = new Set(catalogEntry.allowedVariables);

        for (const key of producedKeys) {
          expect(allowedSet.has(key)).toBe(true);
        }
      });
    }
  });

  describe("template rendering resolves all {{xxx}} placeholders", () => {
    for (const AgentClass of ALL_AGENTS) {
      const agent = makeAgent(AgentClass) as unknown as {
        key: EvaluationAgentKey;
        getAgentTemplateVariables: (
          d: typeof pipelineData,
        ) => Record<string, string>;
        buildCommonTemplateVariables: (
          d: typeof pipelineData,
          notes: Array<{ scope: string; feedback: string }>,
        ) => Record<string, string>;
      };

      it(`${agent.key}: default user prompt has zero unresolved {{}} after rendering`, () => {
        const promptKey = EVALUATION_PROMPT_KEY_BY_AGENT[agent.key];
        const catalogEntry = AI_PROMPT_CATALOG[promptKey];
        const template = catalogEntry.defaultUserPrompt;

        const commonVars = agent.buildCommonTemplateVariables(pipelineData, []);
        const agentVars = agent.getAgentTemplateVariables(pipelineData);
        const allVars: Record<string, string> = {
          ...commonVars,
          ...agentVars,
          contextSections: "## Test Section\nsome context",
          contextJson: JSON.stringify({ test: true }),
        };

        const rendered = (promptService as { renderTemplate: typeof promptService.renderTemplate })
          .renderTemplate(template, allVars);

        const unresolvedMatches = rendered.match(/{{\s*[a-zA-Z0-9_]+\s*}}/g);
        if (unresolvedMatches) {
          throw new Error(
            `Unresolved template variables in ${agent.key}: ${unresolvedMatches.join(", ")}`,
          );
        }
      });
    }
  });

  describe("data flows correctly from pipeline input to variables", () => {
    it("team: teamMembersData contains founder names from scraping", () => {
      const agent = makeAgent(TeamEvaluationAgent) as unknown as {
        getAgentTemplateVariables: (d: typeof pipelineData) => Record<string, string>;
      };
      const vars = agent.getAgentTemplateVariables(pipelineData);
      expect(vars.teamMembersData).toContain("Amina Rao");
      expect(vars.teamMembersData).toContain("Luca Hale");
      expect(vars.teamMembersData).toContain("CEO");
    });

    it("team: teamResearchOutput contains research text", () => {
      const agent = makeAgent(TeamEvaluationAgent) as unknown as {
        getAgentTemplateVariables: (d: typeof pipelineData) => Record<string, string>;
      };
      const vars = agent.getAgentTemplateVariables(pipelineData);
      expect(vars.teamResearchOutput).toContain("industrial SaaS background");
    });

    it("market: marketResearchOutput contains market research", () => {
      const agent = makeAgent(MarketEvaluationAgent) as unknown as {
        getAgentTemplateVariables: (d: typeof pipelineData) => Record<string, string>;
      };
      const vars = agent.getAgentTemplateVariables(pipelineData);
      expect(vars.marketResearchOutput).toContain("compliance tailwinds");
    });

    it("traction: deckTractionData contains notable claims", () => {
      const agent = makeAgent(TractionEvaluationAgent) as unknown as {
        getAgentTemplateVariables: (d: typeof pipelineData) => Record<string, string>;
      };
      const vars = agent.getAgentTemplateVariables(pipelineData);
      expect(vars.deckTractionData).toContain("SOC 2 ready platform");
    });

    it("financials: valuation maps from extraction", () => {
      const agent = makeAgent(FinancialsEvaluationAgent) as unknown as {
        getAgentTemplateVariables: (d: typeof pipelineData) => Record<string, string>;
      };
      const vars = agent.getAgentTemplateVariables(pipelineData);
      expect(vars.valuation).toBe("12000000");
      expect(vars.roundSize).toBe("2500000");
    });

    it("exitPotential: derives provisional valuation from round size when valuation is missing", () => {
      const agent = makeAgent(ExitPotentialEvaluationAgent) as unknown as {
        getAgentTemplateVariables: (d: typeof pipelineData) => Record<string, string>;
      };
      const missingValuationPipeline = {
        ...pipelineData,
        extraction: {
          ...pipelineData.extraction,
          stage: "seed",
          valuation: null,
          fundingAsk: 600000,
          startupContext: {
            ...pipelineData.extraction.startupContext,
            valuationType: null,
          },
        },
      };

      const vars = agent.getAgentTemplateVariables(missingValuationPipeline);

      expect(vars.valuation).toBe("4000000");
      expect(vars.valuationType).toContain("provisional post_money assumption");
      expect(vars.valuationType).toContain("15% typical seed dilution");
    });

    it("common: companyName and sector resolve from extraction", () => {
      const agent = makeAgent(TeamEvaluationAgent) as unknown as {
        buildCommonTemplateVariables: (
          d: typeof pipelineData,
          notes: Array<{ scope: string; feedback: string }>,
        ) => Record<string, string>;
      };
      const vars = agent.buildCommonTemplateVariables(pipelineData, []);
      expect(vars.companyName).toBe("Clipaf");
      expect(vars.stage).toBe("seed");
      expect(vars.website).toBe("https://clipaf.com");
      expect(vars.location).toBe("San Francisco, CA");
    });

    it("common: adminGuidance renders feedback notes", () => {
      const agent = makeAgent(TeamEvaluationAgent) as unknown as {
        buildCommonTemplateVariables: (
          d: typeof pipelineData,
          notes: Array<{ scope: string; feedback: string }>,
        ) => Record<string, string>;
      };
      const vars = agent.buildCommonTemplateVariables(pipelineData, [
        { scope: "agent:team", feedback: "Check founder background" },
        { scope: "phase", feedback: "Be conservative" },
      ]);
      expect(vars.adminGuidance).toContain("[agent:team] Check founder background");
      expect(vars.adminGuidance).toContain("[phase] Be conservative");
    });

    it("common: adminGuidance is 'None' when no notes", () => {
      const agent = makeAgent(TeamEvaluationAgent) as unknown as {
        buildCommonTemplateVariables: (
          d: typeof pipelineData,
          notes: Array<{ scope: string; feedback: string }>,
        ) => Record<string, string>;
      };
      const vars = agent.buildCommonTemplateVariables(pipelineData, []);
      expect(vars.adminGuidance).toBe("None");
    });

    it("common: websiteContent comes from scraping.website.fullText", () => {
      const agent = makeAgent(TeamEvaluationAgent) as unknown as {
        buildCommonTemplateVariables: (
          d: typeof pipelineData,
          notes: Array<{ scope: string; feedback: string }>,
        ) => Record<string, string>;
      };
      const vars = agent.buildCommonTemplateVariables(pipelineData, []);
      expect(vars.websiteContent).toContain("automate quality checks");
    });

    it("market: claimedTAM extracts TAM from pitch deck rawText", () => {
      const agent = makeAgent(MarketEvaluationAgent) as unknown as {
        getAgentTemplateVariables: (d: typeof pipelineData) => Record<string, string>;
      };
      const vars = agent.getAgentTemplateVariables(pipelineData);
      expect(vars.claimedTAM).toContain("TAM");
      expect(vars.claimedTAM).not.toBe("Not provided");
    });

    it("market: claimedSAM extracts SAM from pitch deck rawText", () => {
      const agent = makeAgent(MarketEvaluationAgent) as unknown as {
        getAgentTemplateVariables: (d: typeof pipelineData) => Record<string, string>;
      };
      const vars = agent.getAgentTemplateVariables(pipelineData);
      expect(vars.claimedSAM).toContain("SAM");
      expect(vars.claimedSAM).not.toBe("Not provided");
    });

    it("market: claimedGrowthRate extracts growth from pitch deck rawText", () => {
      const agent = makeAgent(MarketEvaluationAgent) as unknown as {
        getAgentTemplateVariables: (d: typeof pipelineData) => Record<string, string>;
      };
      const vars = agent.getAgentTemplateVariables(pipelineData);
      expect(vars.claimedGrowthRate).toContain("CAGR");
      expect(vars.claimedGrowthRate).not.toBe("Not provided");
    });

    it("market: normalizes legacy payload shape into current schema", () => {
      const agent = makeAgent(MarketEvaluationAgent) as unknown as {
        normalizeOutputCandidate: (value: unknown) => unknown;
      };

      const legacyPayload = {
        marketSizeValidation: {
          score: 92,
          confidence: "high",
          rationale: "TAM is strongly validated against multiple external sources.",
        },
        marketSizeGrowth: {
          score: 88,
          confidence: "high",
          rationale: "Growth claims align to independent CAGR ranges.",
        },
        marketStructureDynamics: {
          score: 84,
          confidence: "medium",
          rationale: "Competition is increasing and well-funded.",
        },
        marketMomentum: {
          score: 90,
          confidence: "high",
          rationale: "Category momentum is strong with clear tailwinds.",
        },
        narrativeSummary: "Legacy market summary.",
        researchGaps: [
          {
            gap: "30x Cost Efficiency Validation",
            impact: "High",
            description: "Independent benchmark data is limited.",
          },
        ],
        tier1Sources: ["IDC"],
        tier2Sources: ["Kings Research"],
      };

      const normalized = agent.normalizeOutputCandidate(legacyPayload);
      const parsed = MarketEvaluationSchema.parse(normalized);

      expect(parsed.score).toBe(89);
      expect(parsed.confidence).toBe("high");
      expect(parsed.keyFindings.length).toBeGreaterThan(0);
      expect(parsed.risks.length).toBeGreaterThan(0);
      expect(parsed.dataGaps[0]?.gap).toContain("30x Cost Efficiency Validation");
      expect(parsed.sources).toEqual(expect.arrayContaining(["IDC", "Kings Research"]));
      expect(parsed.scoring.overallScore).toBe(89);
      expect(parsed.scoring.confidence).toBe("high");
    });

    it("market: repairs placeholder structured fields using legacy rationale content", () => {
      const agent = makeAgent(MarketEvaluationAgent) as unknown as {
        normalizeOutputCandidate: (value: unknown) => unknown;
      };

      const mixedPayload = {
        score: 89,
        confidence: "high",
        narrativeSummary:
          "Validated TAM is approximately $378B by 2032 and SAM for orchestration reaches $20B by 2033.",
        marketSizeValidation: {
          score: 92,
          confidence: "high",
          rationale:
            "Independent sources validate TAM at $378B and SAM around $20B for this segment.",
        },
        marketSizeGrowth: {
          score: 88,
          confidence: "high",
          rationale:
            "Independent market sources estimate category growth at 17.9% to 18.9% CAGR for the orchestration segment.",
        },
        marketStructureDynamics: {
          score: 84,
          confidence: "medium",
          rationale:
            "The market remains fragmented with favorable entry conditions for orchestration.",
        },
        marketMomentum: {
          score: 90,
          confidence: "high",
          rationale:
            "Why now is driven by the shift to production inference and rising agentic workloads.",
        },
        marketSizing: {
          tam: { value: "Unknown", methodology: "top-down", sources: [], confidence: "low" },
          sam: { value: "Unknown", methodology: "Unknown", filters: [], sources: [], confidence: "low" },
          som: { value: "Unknown", methodology: "Unknown", assumptions: "Unknown", confidence: "low" },
          bottomUpSanityCheck: { calculation: "Not performed", notes: "No notes" },
          deckVsResearch: {
            tam: { claimed: "Unknown", researched: "Unknown", alignmentScore: null, notes: "No notes" },
            sam: { claimed: "Unknown", researched: "Unknown", alignmentScore: null, notes: "No notes" },
            som: { claimed: "Unknown", researched: "Unknown", alignmentScore: null, notes: "No notes" },
            overallNotes: "No discrepancy noted",
          },
        },
        marketGrowthAndTiming: {
          growthRate: {
            cagr: "Unknown",
            period: "Unknown",
            source: "Unknown",
            deckClaimed: "Unknown",
            discrepancyFlag: "none",
          },
          whyNow: { thesis: "Unknown", supportedByResearch: false, evidence: [] },
          timingAssessment: "right_time",
          timingRationale: "Timing assessment pending",
          marketLifecycle: { position: "emerging", evidence: "Unknown" },
        },
        marketStructure: {
          structureType: "emerging",
          concentrationTrend: { direction: "stable", evidence: "Unknown" },
          entryConditions: { assessment: "neutral", rationale: "Unknown" },
          tailwinds: [],
          headwinds: [],
        },
      };

      const normalized = agent.normalizeOutputCandidate(mixedPayload);
      const parsed = MarketEvaluationSchema.parse(normalized);

      expect(parsed.marketSizing.tam.value).toContain("$");
      expect(parsed.marketSizing.tam.value).not.toBe("Unknown");
      expect(parsed.marketSizing.sam.value).toContain("$");
      expect(parsed.marketSizing.sam.value).not.toBe("Unknown");
      expect(parsed.marketGrowthAndTiming.growthRate.cagr).toContain("%");
      expect(parsed.marketGrowthAndTiming.whyNow.thesis).not.toBe("Unknown");
      expect(parsed.marketGrowthAndTiming.timingRationale).not.toBe(
        "Timing assessment pending",
      );
      expect(parsed.marketStructure.entryConditions.rationale).not.toBe("Unknown");
    });

    it("competitive-advantage: featureMatrix built from competitor research JSON", () => {
      const agent = makeAgent(CompetitiveAdvantageEvaluationAgent) as unknown as {
        getAgentTemplateVariables: (d: typeof pipelineData) => Record<string, string>;
      };
      const vars = agent.getAgentTemplateVariables(pipelineData);
      expect(vars.featureMatrix).toContain("ComplianceBot");
      expect(vars.featureMatrix).toContain("QualityForce");
      expect(vars.featureMatrix).toContain("Automated audits");
      expect(vars.featureMatrix).not.toBe("Not provided");
    });

    it("competitive-advantage: competitiveDynamicsEvidence from competitor research JSON", () => {
      const agent = makeAgent(CompetitiveAdvantageEvaluationAgent) as unknown as {
        getAgentTemplateVariables: (d: typeof pipelineData) => Record<string, string>;
      };
      const vars = agent.getAgentTemplateVariables(pipelineData);
      expect(vars.competitiveDynamicsEvidence).toContain("Mapped 2 direct competitor profiles");
      expect(vars.competitiveDynamicsEvidence).not.toBe("Not provided");
    });

    it("financials: financialModel extracts revenue/ARR/burn lines from deck", () => {
      const agent = makeAgent(FinancialsEvaluationAgent) as unknown as {
        getAgentTemplateVariables: (d: typeof pipelineData) => Record<string, string>;
      };
      const vars = agent.getAgentTemplateVariables(pipelineData);
      expect(vars.financialModel).toContain("ARR");
      expect(vars.financialModel).toContain("Burn rate");
      expect(vars.financialModel).toContain("Gross margin");
      expect(vars.financialModel).not.toBe("Not provided");
    });
  });

  describe("plain-text research output (non-JSON) still extracts data", () => {
    const plainTextPipeline = {
      ...createEvaluationPipelineInput(),
      research: {
        ...createEvaluationPipelineInput().research,
        market: [
          "## Market Size",
          "The TAM for industrial compliance software is estimated at $18B globally.",
          "Independent SAM estimates place the serviceable addressable market at $3.2B for mid-market manufacturing.",
          "## Market Growth",
          "Market growth rate (CAGR) is projected at 22% driven by regulatory tailwinds.",
          "## Key Trends",
          "Tailwinds: increasing compliance burden, digital transformation adoption.",
        ].join("\n"),
        competitor: [
          "## Competitor Identification",
          "Direct competitors include ComplianceBot and QualityForce.",
          "## ComplianceBot Profile",
          "Key features: automated audits, real-time monitoring, API integrations",
          "Pricing: $500/mo starter tier, enterprise custom pricing",
          "Platform capabilities include compliance tracking and workflow automation",
          "## QualityForce Profile",
          "Key product features: workflow builder, ISO compliance, mobile inspections",
          "Solution designed for manufacturing quality assurance",
          "## Feature Comparison Matrix",
          "ComplianceBot: automated audits (full), workflow builder (partial), mobile (none)",
          "QualityForce: automated audits (partial), workflow builder (full), mobile (full)",
          "## Competitive Dynamics Evidence",
          "Market share signals suggest ComplianceBot leads with ~15% share in mid-market.",
          "Barriers to entry include compliance certification requirements and integration depth.",
          "Switching costs are moderate due to data migration complexity.",
          "Network effects are limited in this vertical SaaS segment.",
          "Consolidation activity: no major M&A in the past 12 months.",
        ].join("\n"),
      },
    } as unknown as ReturnType<typeof createEvaluationPipelineInput>;

    it("market: claimedTAM extracted from plain-text market research", () => {
      const agent = makeAgent(MarketEvaluationAgent) as unknown as {
        getAgentTemplateVariables: (d: typeof plainTextPipeline) => Record<string, string>;
      };
      const vars = agent.getAgentTemplateVariables(plainTextPipeline);
      expect(vars.claimedTAM).toContain("TAM");
      expect(vars.claimedTAM).not.toBe("Not provided");
    });

    it("market: claimedSAM extracted from plain-text market research", () => {
      const agent = makeAgent(MarketEvaluationAgent) as unknown as {
        getAgentTemplateVariables: (d: typeof plainTextPipeline) => Record<string, string>;
      };
      const vars = agent.getAgentTemplateVariables(plainTextPipeline);
      expect(vars.claimedSAM).toContain("SAM");
      expect(vars.claimedSAM).not.toBe("Not provided");
    });

    it("market: claimedGrowthRate extracted from plain-text market research", () => {
      const agent = makeAgent(MarketEvaluationAgent) as unknown as {
        getAgentTemplateVariables: (d: typeof plainTextPipeline) => Record<string, string>;
      };
      const vars = agent.getAgentTemplateVariables(plainTextPipeline);
      expect(vars.claimedGrowthRate).toContain("CAGR");
      expect(vars.claimedGrowthRate).not.toBe("Not provided");
    });

    it("competitive-advantage: featureMatrix extracted from plain-text competitor report", () => {
      const agent = makeAgent(CompetitiveAdvantageEvaluationAgent) as unknown as {
        getAgentTemplateVariables: (d: typeof plainTextPipeline) => Record<string, string>;
      };
      const vars = agent.getAgentTemplateVariables(plainTextPipeline);
      expect(vars.featureMatrix).not.toBe("Not provided");
      expect(vars.featureMatrix).toContain("feature");
    });

    it("competitive-advantage: competitiveDynamicsEvidence extracted from plain-text competitor report", () => {
      const agent = makeAgent(CompetitiveAdvantageEvaluationAgent) as unknown as {
        getAgentTemplateVariables: (d: typeof plainTextPipeline) => Record<string, string>;
      };
      const vars = agent.getAgentTemplateVariables(plainTextPipeline);
      expect(vars.competitiveDynamicsEvidence).not.toBe("Not provided");
      expect(vars.competitiveDynamicsEvidence.toLowerCase()).toContain("market share");
    });

    it("competitive-advantage: featureMatrix contains feature comparison lines", () => {
      const agent = makeAgent(CompetitiveAdvantageEvaluationAgent) as unknown as {
        getAgentTemplateVariables: (d: typeof plainTextPipeline) => Record<string, string>;
      };
      const vars = agent.getAgentTemplateVariables(plainTextPipeline);
      // Should pick up lines mentioning features, platform, solution, comparison, etc.
      const lines = vars.featureMatrix.split("\n");
      expect(lines.length).toBeGreaterThan(1);
    });

    it("competitive-advantage: competitiveDynamicsEvidence contains barriers and switching costs", () => {
      const agent = makeAgent(CompetitiveAdvantageEvaluationAgent) as unknown as {
        getAgentTemplateVariables: (d: typeof plainTextPipeline) => Record<string, string>;
      };
      const vars = agent.getAgentTemplateVariables(plainTextPipeline);
      expect(vars.competitiveDynamicsEvidence.toLowerCase()).toContain("barrier");
    });
  });

  describe("sparse / missing data produces safe defaults", () => {
    const sparsePipeline = {
      extraction: {
        companyName: "SparseCo",
        founderNames: [],
        industry: "",
        stage: "",
        location: "",
        website: "",
        fundingAsk: null,
        valuation: null,
        rawText: "",
      },
      scraping: {
        websiteUrl: "",
        websiteSummary: "",
        website: null,
        teamMembers: [],
        notableClaims: [],
        scrapeErrors: [],
      },
      research: {
        team: null,
        market: null,
        product: null,
        news: null,
        competitor: null,
        combinedReportText: "",
        sources: [],
        errors: [],
      },
    } as unknown as ReturnType<typeof createEvaluationPipelineInput>;

    for (const AgentClass of ALL_AGENTS) {
      const agent = makeAgent(AgentClass) as unknown as {
        key: EvaluationAgentKey;
        getAgentTemplateVariables: (d: typeof sparsePipeline) => Record<string, string>;
        buildCommonTemplateVariables: (
          d: typeof sparsePipeline,
          notes: Array<{ scope: string; feedback: string }>,
        ) => Record<string, string>;
      };

      it(`${agent.key}: does not throw with sparse data`, () => {
        expect(() => agent.getAgentTemplateVariables(sparsePipeline)).not.toThrow();
        expect(() => agent.buildCommonTemplateVariables(sparsePipeline, [])).not.toThrow();
      });

      it(`${agent.key}: all values are strings even with sparse data`, () => {
        const agentVars = agent.getAgentTemplateVariables(sparsePipeline);
        const commonVars = agent.buildCommonTemplateVariables(sparsePipeline, []);
        for (const value of [...Object.values(agentVars), ...Object.values(commonVars)]) {
          expect(typeof value).toBe("string");
        }
      });
    }
  });
});
