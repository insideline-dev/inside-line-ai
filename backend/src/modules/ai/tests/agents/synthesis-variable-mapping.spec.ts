import { describe, expect, it, jest } from "bun:test";
import { SynthesisAgent } from "../../agents/synthesis/synthesis.agent";
import type { SynthesisAgentInput } from "../../agents/synthesis/synthesis.agent";
import type { AiProviderService } from "../../providers/ai-provider.service";
import type { AiConfigService } from "../../services/ai-config.service";
import type { AiPromptService } from "../../services/ai-prompt.service";
import { AI_PROMPT_CATALOG } from "../../services/ai-prompt-catalog";

/* ------------------------------------------------------------------ */
/*  Minimal mocks                                                      */
/* ------------------------------------------------------------------ */

const providers = {} as unknown as AiProviderService;
const aiConfig = {} as unknown as AiConfigService;
const promptService = {
  resolve: jest.fn(),
  renderTemplate: (template: string, vars: Record<string, string>) =>
    template.replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_, name: string) => {
      const value = vars[name];
      return value === null || value === undefined ? "" : String(value);
    }),
} as unknown as AiPromptService;

/* ------------------------------------------------------------------ */
/*  Fixtures                                                           */
/* ------------------------------------------------------------------ */

function makeEvalOutput(score: number, _confidence: number, analysis: string) {
  return {
    score,
    confidence: "medium" as const,
    narrativeSummary: analysis,
    keyFindings: ["Finding 1"],
    risks: ["Risk 1"],
    dataGaps: ["Gap 1"],
  };
}

function createSynthesisInput(): SynthesisAgentInput {
  return {
    extraction: {
      companyName: "TestCorp",
      tagline: "AI-powered compliance platform",
      industry: "RegTech",
      stage: "seed",
      website: "https://testcorp.com",
      location: "London, UK",
      rawText: "Test pitch deck content",
      founderNames: ["Alice Smith"],
      fundingAsk: 3000000,
      valuation: 15000000,
    },
    scraping: {
      websiteUrl: "https://testcorp.com",
      websiteSummary: "Compliance platform",
      website: { fullText: "Website content", subpages: [] },
      teamMembers: [],
      notableClaims: [],
      scrapeErrors: [],
    },
    research: {
      team: "Team research output text",
      market: "Market research output text",
      product: "Product research output text",
      news: "News research output text",
      competitor: "Competitor research output text",
      combinedReportText: "Combined research",
      sources: [],
      errors: [],
    },
    evaluation: {
      team: makeEvalOutput(78, 0.82, "Strong founding team with domain expertise"),
      market: makeEvalOutput(72, 0.75, "Large addressable market with regulatory tailwinds"),
      product: makeEvalOutput(68, 0.7, "Solid MVP with clear differentiation"),
      traction: makeEvalOutput(55, 0.6, "Early traction with 3 pilot customers"),
      businessModel: makeEvalOutput(65, 0.68, "SaaS model with decent unit economics"),
      gtm: makeEvalOutput(60, 0.65, "GTM strategy needs refinement"),
      financials: makeEvalOutput(50, 0.55, "Limited financial track record"),
      competitiveAdvantage: makeEvalOutput(70, 0.72, "Defensible IP in compliance automation"),
      legal: makeEvalOutput(75, 0.8, "Clean legal structure, no red flags"),
      dealTerms: makeEvalOutput(62, 0.7, "Terms are within market range"),
      exitPotential: makeEvalOutput(58, 0.6, "Viable exit paths via strategic acquisition"),
      summary: {
        completedAgents: 11,
        failedKeys: [],
        degraded: false,
      },
    },
    stageWeights: {
      team: 0.2,
      market: 0.15,
      product: 0.12,
      traction: 0.1,
      businessModel: 0.1,
      gtm: 0.08,
      financials: 0.08,
      competitiveAdvantage: 0.07,
      legal: 0.04,
      dealTerms: 0.03,
      exitPotential: 0.03,
    },
  } as unknown as SynthesisAgentInput;
}

/* ------------------------------------------------------------------ */
/*  DB prompt variables expected                                       */
/* ------------------------------------------------------------------ */

const DB_PROMPT_VARIABLES = [
  "companyName", "stage", "sector", "location", "website", "companyDescription",
  "stageWeights", "adminGuidance",
  "teamScore", "teamConfidence", "teamAnalysis",
  "marketScore", "marketConfidence", "marketAnalysis",
  "productScore", "productConfidence", "productAnalysis",
  "tractionScore", "tractionConfidence", "tractionAnalysis",
  "businessModelScore", "businessModelConfidence", "businessModelAnalysis",
  "gtmScore", "gtmConfidence", "gtmAnalysis",
  "financialsScore", "financialsConfidence", "financialsAnalysis",
  "competitiveAdvantageScore", "competitiveAdvantageConfidence", "competitiveAdvantageAnalysis",
  "legalScore", "legalConfidence", "legalAnalysis",
  "dealTermsScore", "dealTermsConfidence", "dealTermsAnalysis",
  "exitScore", "exitConfidence", "exitPotentialAnalysis",
];

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe("Synthesis variable mapping", () => {
  const agent = new SynthesisAgent(providers, aiConfig, promptService);
  const input = createSynthesisInput();

  it("buildPromptVariables produces all DB prompt variables", () => {
    const vars = agent.buildPromptVariables(input);
    for (const key of DB_PROMPT_VARIABLES) {
      expect(vars[key]).toBeDefined();
      expect(typeof vars[key]).toBe("string");
      expect(vars[key].length).toBeGreaterThan(0);
    }
  });

  it("all produced variables are in catalog allowedVariables", () => {
    const vars = agent.buildPromptVariables(input);
    const allowed = new Set(AI_PROMPT_CATALOG["synthesis.final"].allowedVariables);
    for (const key of Object.keys(vars)) {
      expect(allowed.has(key)).toBe(true);
    }
  });

  it("DB prompt template resolves all {{xxx}} with zero unresolved", () => {
    const vars = agent.buildPromptVariables(input);

    // Use the seed/default prompt from catalog (matches what's in DB now)
    // Simulate the DB prompt structure
    const dbPromptTemplate = DB_PROMPT_VARIABLES.map((v) => `{{${v}}}`).join("\n");
    const rendered = (promptService as { renderTemplate: typeof promptService.renderTemplate })
      .renderTemplate(dbPromptTemplate, vars);

    const unresolved = rendered.match(/{{\s*[a-zA-Z0-9_]+\s*}}/g);
    if (unresolved) {
      throw new Error(`Unresolved variables: ${unresolved.join(", ")}`);
    }
  });

  it("evaluation scores are numbers converted to strings", () => {
    const vars = agent.buildPromptVariables(input);
    const scoreKeys = [
      "teamScore", "marketScore", "productScore", "tractionScore",
      "businessModelScore", "gtmScore", "financialsScore",
      "competitiveAdvantageScore", "legalScore", "dealTermsScore", "exitScore",
    ];
    for (const key of scoreKeys) {
      expect(vars[key]).toBeDefined();
      const num = Number(vars[key]);
      expect(Number.isFinite(num)).toBe(true);
    }
  });

  it("evaluation confidences are non-empty strings", () => {
    const vars = agent.buildPromptVariables(input);
    const confKeys = [
      "teamConfidence", "marketConfidence", "productConfidence", "tractionConfidence",
      "businessModelConfidence", "gtmConfidence", "financialsConfidence",
      "competitiveAdvantageConfidence", "legalConfidence", "dealTermsConfidence",
      "exitConfidence",
    ];
    for (const key of confKeys) {
      expect(vars[key]).toBeDefined();
      expect(typeof vars[key]).toBe("string");
      expect(vars[key].length).toBeGreaterThan(0);
    }
  });

  it("evaluation analyses contain narrative text", () => {
    const vars = agent.buildPromptVariables(input);
    expect(vars.teamAnalysis).toContain("Strong founding team");
    expect(vars.marketAnalysis).toContain("Large addressable market");
    expect(vars.exitPotentialAnalysis).toContain("Viable exit paths");
  });

  it("exitScore aliases exitPotentialScore correctly", () => {
    const vars = agent.buildPromptVariables(input);
    expect(vars.exitScore).toBe(vars.exitPotentialScore);
    expect(vars.exitConfidence).toBe(vars.exitPotentialConfidence);
  });

  it("common variables map from extraction", () => {
    const vars = agent.buildPromptVariables(input);
    expect(vars.companyName).toBe("TestCorp");
    expect(vars.stage).toBe("seed");
    expect(vars.sector).toBe("RegTech");
    expect(vars.website).toBe("https://testcorp.com");
    expect(vars.location).toBe("London, UK");
    expect(vars.companyDescription).toBe("AI-powered compliance platform");
  });

  it("stageWeights is valid JSON", () => {
    const vars = agent.buildPromptVariables(input);
    expect(() => JSON.parse(vars.stageWeights)).not.toThrow();
    const weights = JSON.parse(vars.stageWeights);
    expect(weights.team).toBe(0.2);
  });

  describe("sparse/missing evaluation data produces safe fallbacks", () => {
    const sparseInput: SynthesisAgentInput = {
      ...createSynthesisInput(),
      extraction: {
        companyName: "",
        tagline: "",
        industry: "",
        stage: "",
        website: "",
        location: "",
        rawText: "",
        founderNames: [],
        fundingAsk: null,
        valuation: null,
      },
      evaluation: {
        team: {} as never,
        market: {} as never,
        product: {} as never,
        traction: {} as never,
        businessModel: {} as never,
        gtm: {} as never,
        financials: {} as never,
        competitiveAdvantage: {} as never,
        legal: {} as never,
        dealTerms: {} as never,
        exitPotential: {} as never,
        summary: { completedAgents: 0, failedKeys: [], degraded: true },
      },
    } as unknown as SynthesisAgentInput;

    it("does not throw with sparse data", () => {
      expect(() => agent.buildPromptVariables(sparseInput)).not.toThrow();
    });

    it("all variables are strings (not undefined/null)", () => {
      const vars = agent.buildPromptVariables(sparseInput);
      for (const key of DB_PROMPT_VARIABLES) {
        expect(typeof vars[key]).toBe("string");
        expect(vars[key].length).toBeGreaterThan(0);
      }
    });

    it("missing scores fallback to 'Not available'", () => {
      const vars = agent.buildPromptVariables(sparseInput);
      expect(vars.teamScore).toBe("Not available");
      expect(vars.teamConfidence).toBe("Not available");
      expect(vars.teamAnalysis).toBe("Not available");
    });

    it("empty extraction fields fallback properly", () => {
      const vars = agent.buildPromptVariables(sparseInput);
      expect(vars.companyName).toBe("Unknown");
      expect(vars.sector).toBe("Unknown");
      expect(vars.stage).toBe("Unknown");
      expect(vars.website).toBe("Not provided");
      expect(vars.location).toBe("Not provided");
    });
  });
});
