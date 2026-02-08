import { beforeEach, describe, expect, it, jest, mock } from "bun:test";
import type { ConfigService } from "@nestjs/config";

const generateTextMock = jest.fn();
mock.module("ai", () => ({
  generateText: generateTextMock,
  Output: { object: ({ schema }: { schema: unknown }) => schema },
}));

import type { AiProviderService } from "../../providers/ai-provider.service";
import { ModelPurpose } from "../../interfaces/pipeline.interface";
import { LocationNormalizerService } from "../../services/location-normalizer.service";

describe("LocationNormalizerService", () => {
  let service: LocationNormalizerService;
  let providers: jest.Mocked<AiProviderService>;
  let config: jest.Mocked<ConfigService>;

  const resolvedModel = { provider: "gemini-model" };

  beforeEach(() => {
    generateTextMock.mockReset();

    providers = {
      resolveModelForPurpose: jest.fn().mockReturnValue(resolvedModel),
    } as unknown as jest.Mocked<AiProviderService>;

    config = {
      get: jest.fn(() => undefined),
    } as unknown as jest.Mocked<ConfigService>;

    service = new LocationNormalizerService(
      providers as unknown as AiProviderService,
      config as unknown as ConfigService,
    );
  });

  it("normalizes location via model and caches subsequent hits", async () => {
    generateTextMock.mockResolvedValueOnce({
      output: {
        region: "us",
      },
    });

    const first = await service.normalize("San Francisco, CA");
    const second = await service.normalize("San Francisco, CA");

    expect(first).toBe("us");
    expect(second).toBe("us");
    expect(providers.resolveModelForPurpose).toHaveBeenCalledWith(
      ModelPurpose.LOCATION_NORMALIZATION,
    );
    expect(generateTextMock).toHaveBeenCalledTimes(1);
  });

  it("uses deterministic fallback mapping when model fails", async () => {
    generateTextMock.mockRejectedValueOnce(new Error("provider timeout"));

    const region = await service.normalize("London");

    expect(region).toBe("europe");
  });

  it("returns global for empty location", async () => {
    const region = await service.normalize("  ");

    expect(region).toBe("global");
    expect(generateTextMock).not.toHaveBeenCalled();
  });
});
