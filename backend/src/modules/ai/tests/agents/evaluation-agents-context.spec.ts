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

describe("Evaluation agent context engineering", () => {
  const pipelineData = createEvaluationPipelineInput();

  it("injects researchReportText into evaluation context and avoids legacy structured research keys", () => {
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
      const context = agent.buildContext(pipelineData);
      expect(typeof (context as { researchReportText?: unknown }).researchReportText).toBe(
        "string",
      );
      expect(context).not.toHaveProperty("teamResearch");
      expect(context).not.toHaveProperty("marketResearch");
      expect(context).not.toHaveProperty("productResearch");
    }
  });

  it("retains team-specific context fields", () => {
    const context = new TeamEvaluationAgent(
      providers,
      aiConfig,
      promptService,
    ).buildContext(pipelineData);

    expect(context).toHaveProperty("teamMembers");
    expect(context).toHaveProperty("linkedinProfiles");
    expect(context).toHaveProperty("industry");
  });

  it("retains market-specific context fields", () => {
    const context = new MarketEvaluationAgent(
      providers,
      aiConfig,
      promptService,
    ).buildContext(pipelineData);

    expect(context).toHaveProperty("industry");
    expect(context).toHaveProperty("competitiveLandscape");
    expect(context).toHaveProperty("targetMarket");
  });

  it("retains product-specific context fields", () => {
    const context = new ProductEvaluationAgent(
      providers,
      aiConfig,
      promptService,
    ).buildContext(pipelineData);

    expect(context).toHaveProperty("deckProductSection");
    expect(context).toHaveProperty("websiteProductPages");
    expect(context).toHaveProperty("extractedFeatures");
  });

  it("handles sparse scraping payloads without throwing", () => {
    const sparsePipelineData = {
      ...pipelineData,
      scraping: {
        ...pipelineData.scraping,
        teamMembers: undefined,
        notableClaims: undefined,
        website: {
          ...pipelineData.scraping.website,
          subpages: undefined,
          links: undefined,
          headings: undefined,
          customerLogos: undefined,
          testimonials: undefined,
        },
      },
    } as unknown as typeof pipelineData;

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
      expect(() => agent.buildContext(sparsePipelineData)).not.toThrow();
    }
  });

  it("keeps legal and deal-terms context builders bound when passed as callbacks", () => {
    const legalAgent = new LegalEvaluationAgent(providers, aiConfig, promptService);
    const dealTermsAgent = new DealTermsEvaluationAgent(
      providers,
      aiConfig,
      promptService,
    );
    const legalBuildContext = legalAgent.buildContext;
    const dealTermsBuildContext = dealTermsAgent.buildContext;

    expect(() => legalBuildContext(pipelineData)).not.toThrow();
    expect(() => dealTermsBuildContext(pipelineData)).not.toThrow();
  });
});
