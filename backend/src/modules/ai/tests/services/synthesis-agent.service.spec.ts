import { beforeEach, describe, expect, it, jest, mock } from "bun:test";

const generateObjectMock = jest.fn();
mock.module("ai", () => ({ generateObject: generateObjectMock }));

import type { AiConfigService } from "../../services/ai-config.service";
import type { AiProviderService } from "../../providers/ai-provider.service";
import { ModelPurpose } from "../../interfaces/pipeline.interface";
import { SynthesisAgentService } from "../../services/synthesis-agent.service";
import { createEvaluationPipelineInput } from "../fixtures/evaluation-pipeline.fixture";
import { createMockEvaluationResult } from "../fixtures/mock-evaluation.fixture";

describe("SynthesisAgentService", () => {
  let service: SynthesisAgentService;
  let providers: jest.Mocked<AiProviderService>;
  let aiConfig: jest.Mocked<AiConfigService>;
  const resolvedModel = { provider: "resolved-model" };

  beforeEach(() => {
    generateObjectMock.mockReset();

    providers = {
      resolveModelForPurpose: jest.fn().mockReturnValue(resolvedModel),
    } as unknown as jest.Mocked<AiProviderService>;

    aiConfig = {
      getSynthesisTemperature: jest.fn().mockReturnValue(0.2),
      getSynthesisMaxOutputTokens: jest.fn().mockReturnValue(4000),
    } as unknown as jest.Mocked<AiConfigService>;

    service = new SynthesisAgentService(
      providers as unknown as AiProviderService,
      aiConfig as unknown as AiConfigService,
    );
  });

  it("uses synthesis model config and returns schema-valid output", async () => {
    generateObjectMock.mockResolvedValueOnce({
      object: {
        overallScore: 79.2,
        recommendation: "Consider",
        executiveSummary: "Balanced opportunity with execution risk.",
        strengths: ["Strong team"],
        concerns: ["GTM evidence still early"],
        investmentThesis: "Invest with milestone-based conviction.",
        nextSteps: ["Validate channel scalability"],
        confidenceLevel: "Medium",
        investorMemo: "Investor memo body",
        founderReport: "Founder report body",
        dataConfidenceNotes: "Data quality is moderate-high.",
      },
    });

    const pipeline = createEvaluationPipelineInput();
    const output = await service.generate({
      extraction: pipeline.extraction,
      scraping: pipeline.scraping,
      research: pipeline.research,
      evaluation: createMockEvaluationResult(),
    });

    expect(providers.resolveModelForPurpose).toHaveBeenCalledWith(
      ModelPurpose.SYNTHESIS,
    );
    expect(aiConfig.getSynthesisTemperature).toHaveBeenCalledTimes(1);
    expect(aiConfig.getSynthesisMaxOutputTokens).toHaveBeenCalledTimes(1);
    expect(generateObjectMock).toHaveBeenCalledWith(
      expect.objectContaining({
        temperature: 0.2,
        maxOutputTokens: 4000,
      }),
    );
    expect(output.recommendation).toBe("Consider");
    expect(output.investorMemo).toContain("Investor memo");
  });

  it("routes to gemini provider when synthesis model is non-gpt", async () => {
    generateObjectMock.mockResolvedValueOnce({
      object: {
        overallScore: 75,
        recommendation: "Consider",
        executiveSummary: "Summary",
        strengths: ["Strength"],
        concerns: ["Concern"],
        investmentThesis: "Thesis",
        nextSteps: ["Step"],
        confidenceLevel: "Medium",
        investorMemo: "Investor memo",
        founderReport: "Founder report",
        dataConfidenceNotes: "Confidence note",
      },
    });

    const pipeline = createEvaluationPipelineInput();
    await service.generate({
      extraction: pipeline.extraction,
      scraping: pipeline.scraping,
      research: pipeline.research,
      evaluation: createMockEvaluationResult(),
    });

    expect(providers.resolveModelForPurpose).toHaveBeenCalledWith(
      ModelPurpose.SYNTHESIS,
    );
  });
});
