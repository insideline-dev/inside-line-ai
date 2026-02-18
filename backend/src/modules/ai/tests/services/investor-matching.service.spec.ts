import { beforeEach, describe, expect, it, jest, mock } from "bun:test";

const generateTextMock = jest.fn();
mock.module("ai", () => ({
  generateText: generateTextMock,
  Output: { object: ({ schema }: { schema: unknown }) => schema },
}));

import { StartupStage } from "../../../startup/entities";
import type { DrizzleService } from "../../../../database";
import type { AiProviderService } from "../../providers/ai-provider.service";
import type { AiPromptService } from "../../services/ai-prompt.service";
import type { AiConfigService } from "../../services/ai-config.service";
import type { ScoreComputationService } from "../../services/score-computation.service";
import { InvestorMatchingService } from "../../services/investor-matching.service";
import { createMockInvestorCandidates } from "../fixtures/mock-investor.fixture";
import { createMockSynthesisResult } from "../fixtures/mock-synthesis.fixture";

describe("InvestorMatchingService", () => {
  let service: InvestorMatchingService;
  let drizzle: jest.Mocked<DrizzleService>;
  let providers: jest.Mocked<AiProviderService>;
  let promptService: jest.Mocked<AiPromptService>;
  let aiConfig: jest.Mocked<AiConfigService>;
  let scoreComputation: jest.Mocked<ScoreComputationService>;
  const resolvedModel = { provider: "openai-model" };

  beforeEach(() => {
    generateTextMock.mockReset();

    const candidates = createMockInvestorCandidates();
    let selectCalls = 0;

    drizzle = {
      db: {
        select: jest.fn().mockImplementation(() => {
          selectCalls += 1;
          if (selectCalls === 1) {
            return {
              from: jest.fn().mockReturnValue({
                where: jest.fn().mockResolvedValue(candidates),
              }),
            };
          }

          return {
            from: jest.fn().mockReturnValue({
              where: jest.fn().mockReturnValue({
                limit: jest.fn().mockResolvedValue([]),
              }),
            }),
          };
        }),
        update: jest.fn().mockReturnValue({
          set: jest.fn().mockReturnValue({
            where: jest.fn().mockResolvedValue(undefined),
          }),
        }),
        insert: jest.fn().mockReturnValue({
          values: jest.fn().mockResolvedValue(undefined),
        }),
      },
    } as unknown as jest.Mocked<DrizzleService>;

    providers = {
      resolveModel: jest.fn().mockReturnValue(resolvedModel),
    } as unknown as jest.Mocked<AiProviderService>;

    promptService = {
      resolve: jest.fn().mockResolvedValue({
        key: "matching.thesis",
        stage: "seed",
        systemPrompt: "You are an investor-startup fit analyst.",
        userPrompt:
          "## Investor Thesis\n{{investorThesis}}\n\n## Startup Profile\nSummary: {{startupSummary}}\nRecommendation: {{recommendation}}\nOverall Score: {{overallScore}}",
        source: "code",
        revisionId: null,
      }),
      renderTemplate: jest.fn().mockImplementation((template: string, vars: Record<string, string | number>) => {
        let rendered = template;
        for (const [key, value] of Object.entries(vars)) {
          rendered = rendered.replaceAll(`{{${key}}}`, String(value));
        }
        return rendered;
      }),
    } as unknown as jest.Mocked<AiPromptService>;

    aiConfig = {
      getMatchingTemperature: jest.fn().mockReturnValue(0.2),
      getMatchingMaxOutputTokens: jest.fn().mockReturnValue(500),
      getMatchingMinThesisFitScore: jest.fn().mockReturnValue(80),
      getMatchingFallbackScore: jest.fn().mockReturnValue(30),
    } as unknown as jest.Mocked<AiConfigService>;

    scoreComputation = {
      computeWithInvestorPreferences: jest.fn().mockResolvedValue(82),
    } as unknown as jest.Mocked<ScoreComputationService>;

    service = new InvestorMatchingService(
      drizzle as unknown as DrizzleService,
      providers as unknown as AiProviderService,
      promptService as unknown as AiPromptService,
      aiConfig as unknown as AiConfigService,
      scoreComputation as unknown as ScoreComputationService,
    );
  });

  it("filters investors by stage/industry/check/geography before AI alignment", async () => {
    generateTextMock.mockResolvedValue({
      output: {
        thesisFitScore: 88,
        fitRationale: "Strong fit on market and team assumptions.",
      },
    });

    const result = await service.matchStartup({
      startupId: "startup-1",
      startup: {
        industry: "Industrial SaaS",
        stage: StartupStage.SEED,
        fundingTarget: 2_500_000,
        location: "San Francisco, CA",
      },
      synthesis: createMockSynthesisResult(),
    });

    expect(providers.resolveModel).toHaveBeenCalledWith("gemini-3-flash-preview");
    expect(result.candidatesEvaluated).toBe(2);
    expect(generateTextMock).toHaveBeenCalledTimes(2);
    expect(scoreComputation.computeWithInvestorPreferences).toHaveBeenCalledTimes(2);
    expect(result.matches.length).toBe(2);
    expect(result.failedCandidates).toBe(0);
  });

  it("does not include candidates below thesis fit threshold", async () => {
    generateTextMock
      .mockResolvedValueOnce({
        output: {
          thesisFitScore: 79,
          fitRationale: "Close but below threshold.",
        },
      })
      .mockResolvedValueOnce({
        output: {
          thesisFitScore: 85,
          fitRationale: "Strong alignment.",
        },
      });

    const result = await service.matchStartup({
      startupId: "startup-2",
      startup: {
        industry: "Industrial SaaS",
        stage: StartupStage.SEED,
        fundingTarget: 2_000_000,
        location: "San Francisco, CA",
      },
      synthesis: createMockSynthesisResult(),
      threshold: 80,
    });

    expect(result.matches).toHaveLength(1);
    expect(result.matches[0]?.thesisFitScore).toBe(85);
  });
});
