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

  it("team agent includes only team-relevant context", () => {
    const agent = new TeamEvaluationAgent(providers, aiConfig, promptService);
    const context = agent.buildContext(pipelineData);

    expect(Object.keys(context).sort()).toEqual([
      "companyDescription",
      "industry",
      "linkedinProfiles",
      "teamMembers",
      "teamResearch",
    ]);
    expect(context).not.toHaveProperty("fundingTarget");
    expect(context).not.toHaveProperty("marketResearch");
  });

  it("market agent includes market and TAM context only", () => {
    const agent = new MarketEvaluationAgent(providers, aiConfig, promptService);
    const context = agent.buildContext(pipelineData);

    expect(Object.keys(context).sort()).toEqual([
      "claimedTAM",
      "competitiveLandscape",
      "industry",
      "marketResearch",
      "targetMarket",
    ]);
    expect(context).not.toHaveProperty("linkedinProfiles");
    expect(context).not.toHaveProperty("teamResearch");
  });

  it("product agent includes product section and website product signals", () => {
    const agent = new ProductEvaluationAgent(providers, aiConfig, promptService);
    const context = agent.buildContext(pipelineData);

    expect(Object.keys(context).sort()).toEqual([
      "deckProductSection",
      "demoUrl",
      "extractedFeatures",
      "productResearch",
      "websiteProductPages",
    ]);
    expect(context).not.toHaveProperty("newsResearch");
    expect(context).not.toHaveProperty("fundingTarget");
  });

  it("traction agent includes metrics and news signals", () => {
    const agent = new TractionEvaluationAgent(providers, aiConfig, promptService);
    const context = agent.buildContext(pipelineData);

    expect(Object.keys(context).sort()).toEqual([
      "newsResearch",
      "previousFunding",
      "stage",
      "tractionMetrics",
    ]);
    expect(context).not.toHaveProperty("teamMembers");
    expect(context).not.toHaveProperty("legalData");
  });

  it("business model agent includes pricing and revenue context", () => {
    const agent = new BusinessModelEvaluationAgent(providers, aiConfig, promptService);
    const context = agent.buildContext(pipelineData);

    expect(Object.keys(context).sort()).toEqual([
      "deckBusinessModelSection",
      "pricing",
      "revenueModel",
      "unitEconomics",
    ]);
    expect(context).not.toHaveProperty("teamResearch");
    expect(context).not.toHaveProperty("legalData");
  });

  it("gtm agent includes marketing pages and distribution context", () => {
    const agent = new GtmEvaluationAgent(providers, aiConfig, promptService);
    const context = agent.buildContext(pipelineData);

    expect(Object.keys(context).sort()).toEqual([
      "customerAcquisitionStrategy",
      "distributionChannels",
      "targetMarket",
      "websiteMarketingPages",
    ]);
    expect(context).not.toHaveProperty("dealTerms");
    expect(context).not.toHaveProperty("financialProjections");
  });

  it("financials agent includes financial assumptions only", () => {
    const agent = new FinancialsEvaluationAgent(providers, aiConfig, promptService);
    const context = agent.buildContext(pipelineData);

    expect(Object.keys(context).sort()).toEqual([
      "burnRate",
      "currentValuation",
      "financialProjections",
      "fundingTarget",
      "previousFunding",
    ]);
    expect(context).not.toHaveProperty("teamResearch");
    expect(context).not.toHaveProperty("productResearch");
  });

  it("competitive advantage agent includes moat-specific context", () => {
    const agent = new CompetitiveAdvantageEvaluationAgent(providers, aiConfig, promptService);
    const context = agent.buildContext(pipelineData);

    expect(Object.keys(context).sort()).toEqual([
      "extractedFeatures",
      "patents",
      "productResearch",
      "techStack",
    ]);
    expect(context).not.toHaveProperty("financialProjections");
    expect(context).not.toHaveProperty("newsResearch");
  });

  it("legal agent includes compliance and regulatory context", () => {
    const agent = new LegalEvaluationAgent(providers, aiConfig, promptService);
    const context = agent.buildContext(pipelineData);

    expect(Object.keys(context).sort()).toEqual([
      "complianceMentions",
      "industry",
      "location",
      "regulatoryLandscape",
    ]);
    expect(context).not.toHaveProperty("linkedinProfiles");
    expect(context).not.toHaveProperty("marketSize");
  });

  it("deal terms agent includes fundraising structure details", () => {
    const agent = new DealTermsEvaluationAgent(providers, aiConfig, promptService);
    const context = agent.buildContext(pipelineData);

    expect(Object.keys(context).sort()).toEqual([
      "currentValuation",
      "fundingTarget",
      "investorRights",
      "leadInvestorStatus",
      "raiseType",
    ]);
    expect(context).not.toHaveProperty("teamResearch");
    expect(context).not.toHaveProperty("competitorFeatures");
  });

  it("exit potential agent includes market size and M&A signals", () => {
    const agent = new ExitPotentialEvaluationAgent(providers, aiConfig, promptService);
    const context = agent.buildContext(pipelineData);

    expect(Object.keys(context).sort()).toEqual([
      "businessModelScalability",
      "competitorMandA",
      "exitOpportunities",
      "marketSize",
    ]);
    expect(context).not.toHaveProperty("linkedinProfiles");
    expect(context).not.toHaveProperty("pricing");
  });
});
