import { beforeEach, describe, expect, it, jest, mock } from "bun:test";

const generateTextMock = jest.fn();
mock.module("ai", () => ({
  generateText: generateTextMock,
  Output: { object: ({ schema }: { schema: unknown }) => schema },
}));

import type { AiConfigService } from "../../services/ai-config.service";
import type { AiProviderService } from "../../providers/ai-provider.service";
import type { AiPromptService } from "../../services/ai-prompt.service";
import { ModelPurpose } from "../../interfaces/pipeline.interface";
import { SynthesisAgent } from "../../agents/synthesis";
import { createEvaluationPipelineInput } from "../fixtures/evaluation-pipeline.fixture";
import { createMockEvaluationResult } from "../fixtures/mock-evaluation.fixture";

describe("SynthesisAgent exit scenarios", () => {
  let service: SynthesisAgent;
  let providers: jest.Mocked<AiProviderService>;
  let aiConfig: jest.Mocked<AiConfigService>;
  let promptService: jest.Mocked<AiPromptService>;

  const resolvedModel = { provider: "resolved-model" };

  const sectionRewriteOutput = {
    sectionKey: "team",
    title: "Team",
    memoNarrative: "Section narrative rewritten.",
    highlights: [],
    concerns: [],
    diligenceItems: [],
    sources: [],
  };

  const finalSynthesisOutput = {
    dealSnapshot: "Clipaf looks directionally promising with execution still to prove.",
    keyStrengths: ["Founder-market fit"],
    keyRisks: ["Need stronger GTM proof"],
    investorMemo: {
      executiveSummary:
        "Clipaf addresses a real workflow pain point in industrial software, but scaling evidence remains early.",
      sections: [],
      keyDueDiligenceAreas: ["Validate repeatability of demand"],
    },
    founderReport: {
      summary: "You have a credible wedge and need stronger repeatability proof.",
      whatsWorking: ["Clear pain point"],
      pathToInevitability: ["Prove expansion and retention"],
    },
    dataConfidenceNotes: "Evidence quality is moderate.",
  };

  beforeEach(() => {
    generateTextMock.mockReset();
    generateTextMock.mockImplementation((payload: unknown) => {
      if (
        payload &&
        typeof payload === "object" &&
        typeof (payload as { prompt?: unknown }).prompt === "string" &&
        (payload as { prompt: string }).prompt.includes("Rewrite section narrative for")
      ) {
        return Promise.resolve({ output: sectionRewriteOutput });
      }

      return Promise.resolve({ output: finalSynthesisOutput });
    });

    providers = {
      resolveModelForPurpose: jest.fn().mockReturnValue(resolvedModel),
    } as unknown as jest.Mocked<AiProviderService>;

    aiConfig = {
      getSynthesisTemperature: jest.fn().mockReturnValue(0.2),
      getSynthesisMaxOutputTokens: jest.fn().mockReturnValue(4000),
      getSynthesisMaxAttempts: jest.fn().mockReturnValue(1),
      getSynthesisAgentHardTimeoutMs: jest.fn().mockReturnValue(90_000),
      getSynthesisAttemptTimeoutMs: jest.fn().mockReturnValue(90_000),
    } as unknown as jest.Mocked<AiConfigService>;

    promptService = {
      resolve: jest.fn().mockResolvedValue({
        key: "synthesis.final",
        stage: "seed",
        systemPrompt: "Required Output Fields",
        userPrompt: "{{synthesisBrief}}",
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

    service = new SynthesisAgent(
      providers as unknown as AiProviderService,
      aiConfig as unknown as AiConfigService,
      promptService as unknown as AiPromptService,
    );
  });

  it("returns exit scenarios in canonical order after synthesis normalization", async () => {
    const pipeline = createEvaluationPipelineInput();
    const evaluation = createMockEvaluationResult();
    evaluation.exitPotential = {
      ...evaluation.exitPotential,
      exitScenarios: [
        {
          scenario: "optimistic",
          exitType: "IPO or M&A",
          exitValuation: " $1B+ ",
          timeline: " 7-10 years ",
          moic: 18,
          irr: 45,
          researchBasis: " Top-decile outcome ",
        },
        {
          scenario: "conservative",
          exitType: "M&A",
          exitValuation: " $150M-$200M ",
          timeline: " 6-8 years ",
          moic: 3,
          irr: 20,
          researchBasis: " Median seed M&A exits ",
        },
        {
          scenario: "moderate",
          exitType: "M&A",
          exitValuation: " $400M-$600M ",
          timeline: " 5-7 years ",
          moic: 7.5,
          irr: 32,
          researchBasis: " Mid-market SaaS acquisition comps ",
        },
      ],
    };

    const output = await service.run({
      extraction: pipeline.extraction,
      scraping: pipeline.scraping,
      research: pipeline.research,
      evaluation,
      stageWeights: {
        team: 0.25,
        traction: 0.2,
        market: 0.2,
        product: 0.15,
        dealTerms: 0.1,
        exitPotential: 0.1,
      },
    });

    expect(output.exitScenarios.map((scenario) => scenario.scenario)).toEqual([
      "conservative",
      "moderate",
      "optimistic",
    ]);
    expect(output.exitScenarios[0]?.exitValuation).toBe("$150M-$200M");
    expect(output.exitScenarios[2]?.researchBasis).toBe("Top-decile outcome");
  });

  it("falls back to an empty exit-scenarios array when exit-potential payload is schema-invalid", async () => {
    const pipeline = createEvaluationPipelineInput();
    const evaluation = createMockEvaluationResult();
    evaluation.exitPotential = {
      ...evaluation.exitPotential,
      exitScenarios: [
        {
          scenario: "conservative",
          exitType: "M&A",
          exitValuation: "$150M",
          timeline: "6 years",
          moic: 3,
          irr: 20,
        },
        {
          scenario: "moderate",
          exitType: "M&A",
          exitValuation: "$400M",
          timeline: "5 years",
          moic: 7,
          irr: 32,
        },
        {
          scenario: "optimistic",
          exitType: "IPO",
          exitValuation: "$1B",
          timeline: "8 years",
          moic: 18,
          irr: 45,
        },
      ] as unknown as typeof evaluation.exitPotential.exitScenarios,
    };

    const output = await service.run({
      extraction: pipeline.extraction,
      scraping: pipeline.scraping,
      research: pipeline.research,
      evaluation,
      stageWeights: {
        team: 0.25,
        traction: 0.2,
        market: 0.2,
        product: 0.15,
        dealTerms: 0.1,
        exitPotential: 0.1,
      },
    });

    expect(output.exitScenarios).toEqual([]);
  });

  it("uses the synthesis model config", async () => {
    const pipeline = createEvaluationPipelineInput();
    const evaluation = createMockEvaluationResult();

    await service.run({
      extraction: pipeline.extraction,
      scraping: pipeline.scraping,
      research: pipeline.research,
      evaluation,
      stageWeights: {
        team: 0.25,
        traction: 0.2,
        market: 0.2,
        product: 0.15,
        dealTerms: 0.1,
        exitPotential: 0.1,
      },
    });

    expect(providers.resolveModelForPurpose).toHaveBeenCalledWith(
      ModelPurpose.SYNTHESIS,
    );
  });
});
