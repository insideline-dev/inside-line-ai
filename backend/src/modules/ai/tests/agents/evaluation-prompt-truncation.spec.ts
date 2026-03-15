import { describe, expect, it } from "bun:test";
import { MarketEvaluationAgent } from "../../agents/evaluation/market-evaluation.agent";
import { ExitPotentialEvaluationAgent } from "../../agents/evaluation/exit-potential-evaluation.agent";
import type { AiProviderService } from "../../providers/ai-provider.service";
import type { AiConfigService } from "../../services/ai-config.service";
import type { AiPromptService } from "../../services/ai-prompt.service";
import { createEvaluationPipelineInput } from "../fixtures/evaluation-pipeline.fixture";

const providers = {} as unknown as AiProviderService;
const aiConfig = {} as unknown as AiConfigService;
const promptService = {} as unknown as AiPromptService;

describe("Evaluation prompt truncation", () => {
  it("market agent truncates large market research blobs", () => {
    const agent = new MarketEvaluationAgent(providers, aiConfig, promptService);
    const pipelineData = createEvaluationPipelineInput();
    pipelineData.research.market = "M".repeat(20_000);

    const vars = agent.getAgentTemplateVariables(pipelineData);

    expect(vars.marketResearchOutput.length).toBeLessThan(8_200);
    expect(vars.marketResearchOutput).toContain("[truncated");
  });

  it("exit potential agent truncates heavy research inputs", () => {
    const agent = new ExitPotentialEvaluationAgent(
      providers,
      aiConfig,
      promptService,
    );
    const pipelineData = createEvaluationPipelineInput();
    pipelineData.research.market = "A".repeat(20_000);
    pipelineData.research.competitor = "B".repeat(20_000);
    pipelineData.research.news = "C".repeat(20_000);

    const vars = agent.getAgentTemplateVariables(pipelineData);

    expect(vars.marketResearchOutput.length).toBeLessThan(5_200);
    expect(vars.competitorResearchOutput.length).toBeLessThan(5_200);
    expect(vars.newsResearchOutput.length).toBeLessThan(5_200);
    expect(vars.marketResearchOutput).toContain("[truncated");
    expect(vars.competitorResearchOutput).toContain("[truncated");
    expect(vars.newsResearchOutput).toContain("[truncated");
  });
});
