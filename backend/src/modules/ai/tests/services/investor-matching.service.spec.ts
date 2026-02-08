import { beforeEach, describe, expect, it, jest, mock } from "bun:test";

const generateTextMock = jest.fn();
mock.module("ai", () => ({
  generateText: generateTextMock,
  Output: { object: ({ schema }: { schema: unknown }) => schema },
}));

import { StartupStage } from "../../../startup/entities";
import type { DrizzleService } from "../../../../database";
import type { AiProviderService } from "../../providers/ai-provider.service";
import { ModelPurpose } from "../../interfaces/pipeline.interface";
import { InvestorMatchingService } from "../../services/investor-matching.service";
import type { LocationNormalizerService } from "../../services/location-normalizer.service";
import { createMockInvestorCandidates } from "../fixtures/mock-investor.fixture";
import { createMockSynthesisResult } from "../fixtures/mock-synthesis.fixture";

describe("InvestorMatchingService", () => {
  let service: InvestorMatchingService;
  let drizzle: jest.Mocked<DrizzleService>;
  let providers: jest.Mocked<AiProviderService>;
  let locationNormalizer: jest.Mocked<LocationNormalizerService>;
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
      resolveModelForPurpose: jest.fn().mockReturnValue(resolvedModel),
    } as unknown as jest.Mocked<AiProviderService>;

    locationNormalizer = {
      normalize: jest.fn().mockResolvedValue("us"),
    } as unknown as jest.Mocked<LocationNormalizerService>;

    service = new InvestorMatchingService(
      drizzle as unknown as DrizzleService,
      providers as unknown as AiProviderService,
      locationNormalizer as unknown as LocationNormalizerService,
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

    expect(locationNormalizer.normalize).toHaveBeenCalledWith("San Francisco, CA");
    expect(providers.resolveModelForPurpose).toHaveBeenCalledWith(
      ModelPurpose.THESIS_ALIGNMENT,
    );
    expect(result.candidatesEvaluated).toBe(2);
    expect(generateTextMock).toHaveBeenCalledTimes(2);
    expect(result.matches.length).toBe(2);
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
