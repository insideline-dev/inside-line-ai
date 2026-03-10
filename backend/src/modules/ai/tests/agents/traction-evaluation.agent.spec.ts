import { beforeEach, describe, expect, it, jest, mock } from "bun:test";

const generateTextMock = jest.fn();

mock.module("ai", () => ({
  generateText: generateTextMock,
  Output: { object: ({ schema }: { schema: unknown }) => schema },
  NoObjectGeneratedError: class NoObjectGeneratedError extends Error {
    static isInstance(e: unknown) { return e instanceof this; }
  },
}));

import { TractionEvaluationAgent } from "../../agents/evaluation/traction-evaluation.agent";
import type { AiProviderService } from "../../providers/ai-provider.service";
import type { AiConfigService } from "../../services/ai-config.service";
import type { AiPromptService } from "../../services/ai-prompt.service";
import { createEvaluationPipelineInput } from "../fixtures/evaluation-pipeline.fixture";

describe("TractionEvaluationAgent", () => {
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

  it("returns model output without metrics field (SimpleEvaluationSchema)", async () => {
    const pipelineData = createEvaluationPipelineInput();

    generateTextMock.mockResolvedValueOnce({
      output: {
        score: 72,
        confidence: "medium",
        narrativeSummary: "Early traction with three pilot customers and positive engagement signals.",
        keyFindings: ["3 pilot customers signed", "NPS of 60 reported"],
        risks: ["Very early stage"],
        dataGaps: ["No cohort retention data"],
        sources: ["https://example.com"],
      },
    });

    const result = await agent.run(pipelineData);

    expect(result.usedFallback).toBe(false);
    expect(result.output.score).toBe(72);
    expect(result.output.confidence).toBe("mid");
    expect("metrics" in result.output).toBe(false);
  });

  it("does not fail when notableClaims contains TPV-style text (no sanitization)", async () => {
    const pipelineData = createEvaluationPipelineInput();
    pipelineData.scraping.notableClaims = ["Company processed over $1T TPV last year."];

    generateTextMock.mockResolvedValueOnce({
      output: {
        score: 80,
        confidence: "high",
        narrativeSummary: "Strong volume metrics with large-scale processing evidence.",
        keyFindings: ["$1T TPV processed"],
        risks: ["Revenue vs volume distinction unclear"],
        dataGaps: ["Net revenue not confirmed"],
        sources: [],
      },
    });

    const result = await agent.run(pipelineData);

    expect(result.usedFallback).toBe(false);
    expect(result.output.score).toBe(80);
  });

  it("uses fallback with confidence 'low' when model fails", async () => {
    const pipelineData = createEvaluationPipelineInput();
    generateTextMock.mockRejectedValue(new Error("provider timeout"));

    const result = await agent.run(pipelineData);

    expect(result.usedFallback).toBe(true);
    expect(result.output.confidence).toBe("low");
    expect(result.output.score).toBeLessThanOrEqual(25);
  });

  it("buildContext includes notableClaims in tractionMetrics", () => {
    const pipelineData = createEvaluationPipelineInput();
    pipelineData.scraping.notableClaims = ["ARR reached $12M", "140% NRR"];

    const context = agent.buildContext(pipelineData);

    expect(context.tractionMetrics).toBeDefined();
    const metrics = context.tractionMetrics as { notableClaims: string[] };
    expect(metrics.notableClaims).toContain("ARR reached $12M");
    expect(metrics.notableClaims).toContain("140% NRR");
  });

  it("buildContext handles missing notableClaims gracefully", () => {
    const pipelineData = createEvaluationPipelineInput();
    pipelineData.scraping.notableClaims = [];

    const context = agent.buildContext(pipelineData);

    const metrics = context.tractionMetrics as { notableClaims: string[] };
    expect(metrics.notableClaims).toEqual([]);
  });
});
