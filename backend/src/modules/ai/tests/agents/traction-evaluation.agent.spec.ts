import { beforeEach, describe, expect, it, jest, mock } from "bun:test";

const generateTextMock = jest.fn();

mock.module("ai", () => ({
  generateText: generateTextMock,
  Output: { object: ({ schema }: { schema: unknown }) => schema },
}));

import { TractionEvaluationAgent } from "../../agents/evaluation/traction-evaluation.agent";
import { ModelPurpose } from "../../interfaces/pipeline.interface";
import type { AiProviderService } from "../../providers/ai-provider.service";
import type { AiConfigService } from "../../services/ai-config.service";
import type { AiPromptService } from "../../services/ai-prompt.service";
import { createEvaluationPipelineInput } from "../fixtures/evaluation-pipeline.fixture";

describe("TractionEvaluationAgent metric sanitization", () => {
  let agent: TractionEvaluationAgent;
  let providers: jest.Mocked<AiProviderService>;
  let aiConfig: jest.Mocked<AiConfigService>;
  let promptService: jest.Mocked<AiPromptService>;
  const modelInstance = { providerModel: "gemini-3.0-flash" };

  beforeEach(() => {
    generateTextMock.mockReset();

    providers = {
      resolveModelForPurpose: jest.fn().mockReturnValue(modelInstance),
    } as unknown as jest.Mocked<AiProviderService>;

    aiConfig = {
      getEvaluationTemperature: jest.fn().mockReturnValue(0.2),
      getEvaluationMaxOutputTokens: jest.fn().mockReturnValue(4000),
      getEvaluationTimeoutMs: jest.fn().mockReturnValue(120000),
    } as unknown as jest.Mocked<AiConfigService>;

    promptService = {
      resolve: jest.fn().mockResolvedValue({
        key: "evaluation.traction",
        stage: "seed",
        systemPrompt: "Traction evaluator",
        userPrompt: "{{contextSections}}",
        source: "code",
        revisionId: null,
      }),
      renderTemplate: jest.fn().mockImplementation((template: string, vars: Record<string, string>) => {
        let rendered = template;
        for (const [key, value] of Object.entries(vars)) {
          rendered = rendered.replaceAll(`{{${key}}}`, value);
        }
        return rendered;
      }),
    } as unknown as jest.Mocked<AiPromptService>;

    agent = new TractionEvaluationAgent(
      providers as unknown as AiProviderService,
      aiConfig as unknown as AiConfigService,
      promptService as unknown as AiPromptService,
    );
  });

  it("clears revenue when only TPV-style volume evidence exists", async () => {
    const pipelineData = createEvaluationPipelineInput();
    pipelineData.extraction.stage = "seed";
    pipelineData.scraping.notableClaims = ["Company processed over $1T TPV last year."];
    pipelineData.research.news = {
      articles: [
        {
          title: "Company hits $1T in annual payment volume",
          source: "Fintech Wire",
          date: "2026-01-01",
          summary: "Payment volume expanded rapidly across enterprise merchants.",
          url: "https://news.example.com/tpv",
        },
      ],
      pressReleases: [],
      sentiment: "positive",
      recentEvents: ["Payment volume milestone announced"],
      sources: ["https://news.example.com/tpv"],
    };

    generateTextMock.mockResolvedValueOnce({
      output: {
        score: 90,
        confidence: 0.9,
        feedback: "Strong momentum with broad adoption.",
        keyFindings: ["Volume growth is strong"],
        risks: ["Potential metric ambiguity"],
        dataGaps: ["Net revenue not clearly disclosed"],
        sources: ["https://news.example.com/tpv"],
        metrics: {
          users: 500000,
          revenue: 1_000_000_000_000,
          growthRatePct: 40,
        },
        customerValidation: "Large enterprise adoption",
        growthTrajectory: "Rapidly expanding usage",
        revenueModel: "Transaction fee model",
      },
    });

    const result = await agent.run(pipelineData);

    expect(providers.resolveModelForPurpose).toHaveBeenCalledWith(
      ModelPurpose.EVALUATION,
    );
    expect(result.usedFallback).toBe(false);
    expect(result.output.metrics.revenue).toBeUndefined();
  });

  it("keeps revenue when explicit revenue evidence exists", async () => {
    const pipelineData = createEvaluationPipelineInput();
    pipelineData.scraping.notableClaims = [
      "ARR reached $12M with 140% net revenue retention.",
    ];

    generateTextMock.mockResolvedValueOnce({
      output: {
        score: 82,
        confidence: 0.8,
        feedback: "Revenue quality and growth are solid for stage.",
        keyFindings: ["ARR growth validated"],
        risks: ["Customer concentration risk"],
        dataGaps: ["Cohort view is limited"],
        sources: ["https://metrics.example.com/arr"],
        metrics: {
          users: 4200,
          revenue: 12_000_000,
          growthRatePct: 18,
        },
        customerValidation: "Strong logos and renewal evidence",
        growthTrajectory: "Consistent quarter-over-quarter growth",
        revenueModel: "Annual SaaS subscriptions",
      },
    });

    const result = await agent.run(pipelineData);

    expect(result.usedFallback).toBe(false);
    expect(result.output.metrics.revenue).toBe(12_000_000);
  });
});
