import { describe, expect, it, jest } from "bun:test";
import { BusinessModelEvaluationAgent } from "../../agents/evaluation/business-model-evaluation.agent";
import { CompetitiveAdvantageEvaluationAgent } from "../../agents/evaluation/competitive-advantage-evaluation.agent";
import { DealTermsEvaluationAgent } from "../../agents/evaluation/deal-terms-evaluation.agent";
import { ExitPotentialEvaluationAgent } from "../../agents/evaluation/exit-potential-evaluation.agent";
import { FinancialsEvaluationAgent } from "../../agents/evaluation/financials-evaluation.agent";
import { GtmEvaluationAgent } from "../../agents/evaluation/gtm-evaluation.agent";
import { LegalEvaluationAgent } from "../../agents/evaluation/legal-evaluation.agent";
import { MarketEvaluationAgent } from "../../agents/evaluation/market-evaluation.agent";
import { ProductEvaluationAgent } from "../../agents/evaluation/product-evaluation.agent";
import { TeamEvaluationAgent } from "../../agents/evaluation/team-evaluation.agent";
import { TractionEvaluationAgent } from "../../agents/evaluation/traction-evaluation.agent";
import type { EvaluationPipelineInput } from "../../interfaces/agent.interface";
import type { AiProviderService } from "../../providers/ai-provider.service";
import type { AiConfigService } from "../../services/ai-config.service";
import type { AiPromptService } from "../../services/ai-prompt.service";
import { createEvaluationPipelineInput } from "../fixtures/evaluation-pipeline.fixture";

const providers = {
  getGemini: jest.fn(),
} as unknown as AiProviderService;

const aiConfig = {
  getModelForPurpose: jest.fn(),
} as unknown as AiConfigService;

const promptService = {
  resolve: jest.fn(),
  renderTemplate: jest.fn(),
} as unknown as AiPromptService;

function createSparseInput(): EvaluationPipelineInput {
  const input = createEvaluationPipelineInput();
  return {
    ...input,
    scraping: {
      ...input.scraping,
      website: null,
      websiteSummary: "",
      teamMembers: [],
      notableClaims: [],
    },
    research: {
      ...input.research,
      team: null,
      market: null,
      product: null,
      news: null,
    },
    extraction: {
      ...input.extraction,
      rawText: "",
      fundingAsk: undefined,
      valuation: undefined,
    },
  };
}

describe("Evaluation agent fallbacks", () => {
  const pipelineData = createSparseInput();

  it("all evaluation agents return schema-safe fallback outputs", () => {
    const agents = [
      new TeamEvaluationAgent(providers, aiConfig, promptService),
      new MarketEvaluationAgent(providers, aiConfig, promptService),
      new ProductEvaluationAgent(providers, aiConfig, promptService),
      new TractionEvaluationAgent(providers, aiConfig, promptService),
      new BusinessModelEvaluationAgent(providers, aiConfig, promptService),
      new GtmEvaluationAgent(providers, aiConfig, promptService),
      new FinancialsEvaluationAgent(providers, aiConfig, promptService),
      new CompetitiveAdvantageEvaluationAgent(providers, aiConfig, promptService),
      new LegalEvaluationAgent(providers, aiConfig, promptService),
      new DealTermsEvaluationAgent(providers, aiConfig, promptService),
      new ExitPotentialEvaluationAgent(providers, aiConfig, promptService),
    ];

    for (const agent of agents) {
      const output = agent.fallback(pipelineData);
      const parsed = (output as { score: number; keyFindings: string[]; sources: string[] });

      expect(parsed.score).toBeGreaterThanOrEqual(0);
      expect(parsed.score).toBeLessThanOrEqual(100);
      expect(parsed.keyFindings.length).toBeGreaterThan(0);
      expect(parsed.sources.length).toBeGreaterThan(0);
    }
  });

  it("fallback returns score <= 25 for all agents", () => {
    const agents = [
      new TeamEvaluationAgent(providers, aiConfig, promptService),
      new MarketEvaluationAgent(providers, aiConfig, promptService),
      new ProductEvaluationAgent(providers, aiConfig, promptService),
      new TractionEvaluationAgent(providers, aiConfig, promptService),
      new BusinessModelEvaluationAgent(providers, aiConfig, promptService),
      new GtmEvaluationAgent(providers, aiConfig, promptService),
      new FinancialsEvaluationAgent(providers, aiConfig, promptService),
      new CompetitiveAdvantageEvaluationAgent(providers, aiConfig, promptService),
      new LegalEvaluationAgent(providers, aiConfig, promptService),
      new DealTermsEvaluationAgent(providers, aiConfig, promptService),
      new ExitPotentialEvaluationAgent(providers, aiConfig, promptService),
    ];

    for (const agent of agents) {
      const output = agent.fallback(pipelineData);
      const parsed = output as { score: number };

      expect(parsed.score).toBeLessThanOrEqual(25);
    }
  });

  it("fallback returns confidence <= 0.15 for all agents", () => {
    const agents = [
      new TeamEvaluationAgent(providers, aiConfig, promptService),
      new MarketEvaluationAgent(providers, aiConfig, promptService),
      new ProductEvaluationAgent(providers, aiConfig, promptService),
      new TractionEvaluationAgent(providers, aiConfig, promptService),
      new BusinessModelEvaluationAgent(providers, aiConfig, promptService),
      new GtmEvaluationAgent(providers, aiConfig, promptService),
      new FinancialsEvaluationAgent(providers, aiConfig, promptService),
      new CompetitiveAdvantageEvaluationAgent(providers, aiConfig, promptService),
      new LegalEvaluationAgent(providers, aiConfig, promptService),
      new DealTermsEvaluationAgent(providers, aiConfig, promptService),
      new ExitPotentialEvaluationAgent(providers, aiConfig, promptService),
    ];

    for (const agent of agents) {
      const output = agent.fallback(pipelineData);
      const parsed = output as { confidence: number };

      expect(parsed.confidence).toBeLessThanOrEqual(0.15);
    }
  });

  it("fallback keyFindings contain manual review indicators", () => {
    const agents = [
      new TeamEvaluationAgent(providers, aiConfig, promptService),
      new MarketEvaluationAgent(providers, aiConfig, promptService),
      new ProductEvaluationAgent(providers, aiConfig, promptService),
    ];

    for (const agent of agents) {
      const output = agent.fallback(pipelineData);
      const parsed = output as { keyFindings: string[] };

      const combined = parsed.keyFindings.join(" ").toLowerCase();
      const hasManualReviewIndicator =
        combined.includes("manual review") ||
        combined.includes("failed") ||
        combined.includes("incomplete");

      expect(hasManualReviewIndicator).toBe(true);
    }
  });

  it("fallback risks contain automated assessment warnings", () => {
    const agents = [
      new TeamEvaluationAgent(providers, aiConfig, promptService),
      new MarketEvaluationAgent(providers, aiConfig, promptService),
      new ProductEvaluationAgent(providers, aiConfig, promptService),
    ];

    for (const agent of agents) {
      const output = agent.fallback(pipelineData);
      const parsed = output as { risks: string[] };

      const combined = parsed.risks.join(" ").toLowerCase();
      const hasAutomatedWarning =
        combined.includes("automated") ||
        combined.includes("assessment") ||
        combined.includes("unable");

      expect(hasAutomatedWarning).toBe(true);
    }
  });
});
