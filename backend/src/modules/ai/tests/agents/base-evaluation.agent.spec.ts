import { beforeEach, describe, expect, it, jest, mock } from "bun:test";
import { z } from "zod";

const generateObjectMock = jest.fn();

mock.module("ai", () => ({
  generateObject: generateObjectMock,
}));

import { BaseEvaluationAgent } from "../../agents/evaluation/base-evaluation.agent";
import type { EvaluationPipelineInput } from "../../interfaces/agent.interface";
import { ModelPurpose } from "../../interfaces/pipeline.interface";
import type { AiProviderService } from "../../providers/ai-provider.service";
import type { AiConfigService } from "../../services/ai-config.service";
import { createEvaluationPipelineInput } from "../fixtures/evaluation-pipeline.fixture";

type TestOutput = {
  score: number;
  verdict: string;
};

class TestEvaluationAgent extends BaseEvaluationAgent<TestOutput> {
  readonly key = "team" as const;
  protected readonly schema = z.object({
    score: z.number().int().min(0).max(100),
    verdict: z.string().min(1),
  });
  protected readonly systemPrompt = "Test evaluator";

  readonly buildContext = jest.fn((_pipelineData: EvaluationPipelineInput) => ({
    company: "Clipaf",
  }));

  readonly fallback = jest.fn((_pipelineData: EvaluationPipelineInput) => ({
    score: 50,
    verdict: "Fallback verdict",
  }));
}

describe("BaseEvaluationAgent", () => {
  let providers: jest.Mocked<AiProviderService>;
  let aiConfig: jest.Mocked<AiConfigService>;
  let modelFactoryMock: jest.Mock;
  let agent: TestEvaluationAgent;
  let pipelineData: EvaluationPipelineInput;

  beforeEach(() => {
    generateObjectMock.mockReset();
    modelFactoryMock = jest.fn().mockReturnValue({ providerModel: "gemini-3.0-flash" });

    providers = {
      getGemini: jest.fn().mockReturnValue(modelFactoryMock),
    } as unknown as jest.Mocked<AiProviderService>;

    aiConfig = {
      getModelForPurpose: jest.fn().mockReturnValue("gemini-3.0-flash"),
      getEvaluationTemperature: jest.fn().mockReturnValue(0.2),
      getEvaluationMaxOutputTokens: jest.fn().mockReturnValue(4000),
    } as unknown as jest.Mocked<AiConfigService>;

    agent = new TestEvaluationAgent(
      providers as unknown as AiProviderService,
      aiConfig as unknown as AiConfigService,
    );

    pipelineData = createEvaluationPipelineInput();
  });

  it("runs generateObject with evaluation model and validated schema output", async () => {
    generateObjectMock.mockResolvedValueOnce({
      object: {
        score: 82,
        verdict: "Strong profile",
      },
    });

    const result = await agent.run(pipelineData);

    expect(aiConfig.getModelForPurpose).toHaveBeenCalledWith(
      ModelPurpose.EVALUATION,
    );
    expect(providers.getGemini).toHaveBeenCalledTimes(1);
    expect(modelFactoryMock).toHaveBeenCalledWith("gemini-3.0-flash");
    expect(agent.buildContext).toHaveBeenCalledWith(pipelineData);
    expect(generateObjectMock).toHaveBeenCalledWith(
      expect.objectContaining({
        temperature: 0.2,
        maxOutputTokens: 4000,
        system: "Test evaluator",
      }),
    );
    expect(result).toEqual({
      key: "team",
      output: { score: 82, verdict: "Strong profile" },
      usedFallback: false,
    });
  });

  it("uses fallback when provider call fails", async () => {
    generateObjectMock.mockRejectedValueOnce(new Error("provider timeout"));

    const result = await agent.run(pipelineData);

    expect(agent.fallback).toHaveBeenCalledWith(pipelineData);
    expect(result.usedFallback).toBe(true);
    expect(result.error).toBe("provider timeout");
    expect(result.output).toEqual({
      score: 50,
      verdict: "Fallback verdict",
    });
  });

  it("uses fallback when model output fails schema validation", async () => {
    generateObjectMock.mockResolvedValueOnce({
      object: {
        score: 999,
        verdict: "Invalid",
      },
    });

    const result = await agent.run(pipelineData);

    expect(agent.fallback).toHaveBeenCalledWith(pipelineData);
    expect(result.usedFallback).toBe(true);
    expect(result.error).toBeTruthy();
  });
});
