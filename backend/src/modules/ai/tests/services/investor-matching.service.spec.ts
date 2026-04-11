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
                leftJoin: jest.fn().mockReturnValue({
                  where: jest.fn().mockResolvedValue(candidates),
                }),
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
      resolveModelForPurpose: jest.fn().mockReturnValue(resolvedModel),
    } as unknown as jest.Mocked<AiProviderService>;

    promptService = {
      resolve: jest.fn().mockResolvedValue({
        key: "matching.thesis",
        stage: "seed",
        systemPrompt: "You are an investor-startup fit analyst.",
        userPrompt:
          "## Investor Thesis Summary\n{{investorThesisSummary}}\n\n## Investor Thesis\n{{investorThesis}}\n\n## Startup Profile\nSummary: {{startupSummary}}\nRecommendation: {{recommendation}}\nOverall Score: {{overallScore}}",
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
        industry: "saas",
        sectorIndustryGroup: "software",
        stage: StartupStage.SEED,
        fundingTarget: 2_500_000,
        location: "San Francisco, CA",
      },
      synthesis: createMockSynthesisResult(),
    });

    expect(providers.resolveModelForPurpose).toHaveBeenCalledWith("thesis_alignment");
    expect(result.candidatesEvaluated).toBe(2);
    expect(generateTextMock).toHaveBeenCalledTimes(2);
    expect(scoreComputation.computeWithInvestorPreferences).toHaveBeenCalledTimes(2);
    expect(promptService.renderTemplate).toHaveBeenCalledTimes(2);
    expect(promptService.renderTemplate).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        investorThesisSummary: expect.any(String),
        investorThesis: expect.any(String),
      }),
    );
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
        industry: "saas",
        sectorIndustryGroup: "software",
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

  it("sets thesisFitFallback=true when alignThesis fails and falls back", async () => {
    generateTextMock.mockRejectedValue(new Error("AI provider timeout"));

    const insertValues = jest.fn().mockResolvedValue(undefined);
    (drizzle.db.insert as jest.Mock).mockImplementation(() => {
      return { values: insertValues };
    });

    await service.matchStartup({
      startupId: "startup-fallback",
      startup: {
        industry: "saas",
        sectorIndustryGroup: "software",
        stage: StartupStage.SEED,
        fundingTarget: 2_500_000,
        location: "San Francisco, CA",
      },
      synthesis: createMockSynthesisResult(),
    });

    // Both candidates should have attempted insert/update with thesisFitFallback=true
    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({ thesisFitFallback: true }),
    );
  });

  it("matches via sectorIndustryGroup when industry is a specific value", async () => {
    generateTextMock.mockResolvedValue({
      output: {
        thesisFitScore: 90,
        fitRationale: "Great group-level fit.",
      },
    });

    // Startup has specific industry "saas" with group "software"
    // Investor fixtures have industries: ["software"]
    const result = await service.matchStartup({
      startupId: "startup-group-match",
      startup: {
        industry: "saas",
        sectorIndustryGroup: "software",
        stage: StartupStage.SEED,
        fundingTarget: 2_500_000,
        location: "San Francisco, CA",
      },
      synthesis: createMockSynthesisResult(),
    });

    expect(result.candidatesEvaluated).toBe(2);
  });

  it("falls back to direct industry comparison when sectorIndustryGroup is null", async () => {
    generateTextMock.mockResolvedValue({
      output: {
        thesisFitScore: 90,
        fitRationale: "Direct match.",
      },
    });

    // Startup industry directly matches an investor industry value (legacy path)
    const result = await service.matchStartup({
      startupId: "startup-direct-match",
      startup: {
        industry: "software",
        sectorIndustryGroup: null,
        stage: StartupStage.SEED,
        fundingTarget: 2_500_000,
        location: "San Francisco, CA",
      },
      synthesis: createMockSynthesisResult(),
    });

    expect(result.candidatesEvaluated).toBe(2);
  });

  it("filters out candidates when industries do not overlap at any level", async () => {
    generateTextMock.mockResolvedValue({
      output: {
        thesisFitScore: 90,
        fitRationale: "Would match but filtered first.",
      },
    });

    // No investor has "food_beverage" in their industries
    const result = await service.matchStartup({
      startupId: "startup-no-match",
      startup: {
        industry: "organic_food",
        sectorIndustryGroup: "food_beverage",
        stage: StartupStage.SEED,
        fundingTarget: 2_500_000,
        location: "San Francisco, CA",
      },
      synthesis: createMockSynthesisResult(),
    });

    // Only generalist (global, multi-stage) should pass — but their industries
    // are ["software", "health_care", "artificial_intelligence"], no food_beverage
    expect(result.candidatesEvaluated).toBe(0);
    expect(generateTextMock).not.toHaveBeenCalled();
  });

  it("includes forceIncludeInvestorId even when they fail the first filter", async () => {
    generateTextMock.mockResolvedValue({
      output: {
        thesisFitScore: 45,
        fitRationale: "Poor thesis alignment but forced inclusion.",
      },
    });

    // investor-eu-series-a normally wouldn't pass (wrong stage/industry)
    // but forceIncludeInvestorId should include them anyway
    const result = await service.matchStartup({
      startupId: "startup-forced",
      startup: {
        industry: "organic_food",
        sectorIndustryGroup: "food_beverage",
        stage: StartupStage.SEED,
        fundingTarget: 2_500_000,
        location: "San Francisco, CA",
      },
      synthesis: createMockSynthesisResult(),
      forceIncludeInvestorId: "investor-eu-series-a",
    });

    // Should evaluate the forced investor even though they don't match the industry/stage
    expect(result.candidatesEvaluated).toBe(1);
    expect(generateTextMock).toHaveBeenCalledTimes(1);
  });
});
