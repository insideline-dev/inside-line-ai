import { beforeEach, describe, expect, it, jest, mock } from "bun:test";
import { z } from "zod";
import type { AiConfigService } from "../../services/ai-config.service";
import type { GeminiResearchService } from "../../services/gemini-research.service";
import type { AiProviderService } from "../../providers/ai-provider.service";

const generateTextMock = jest.fn();
const googleSearchMock = jest.fn(() => ({ tool: "google-search" }));

mock.module("ai", () => ({
  generateText: generateTextMock,
}));

mock.module("@ai-sdk/google", () => ({
  google: {
    tools: {
      googleSearch: googleSearchMock,
    },
  },
}));

import { GeminiResearchService as GeminiResearchServiceClass } from "../../services/gemini-research.service";

const MarketSchema = z.object({
  marketReports: z.array(z.string()),
  competitors: z.array(z.object({ name: z.string(), description: z.string(), url: z.string().url() })),
  marketTrends: z.array(z.string()),
  marketSize: z.object({
    tam: z.number().optional(),
    sam: z.number().optional(),
    som: z.number().optional(),
  }),
  sources: z.array(z.string().url()),
});

describe("GeminiResearchService", () => {
  let service: GeminiResearchService;
  let providers: jest.Mocked<AiProviderService>;
  let aiConfig: jest.Mocked<AiConfigService>;
  const modelInstance = { id: "gemini-model-instance" };
  const modelFactoryMock = jest.fn(() => modelInstance);

  beforeEach(() => {
    generateTextMock.mockReset();
    googleSearchMock.mockClear();
    modelFactoryMock.mockClear();

    providers = {
      getGemini: jest.fn(() => modelFactoryMock),
    } as unknown as jest.Mocked<AiProviderService>;

    aiConfig = {
      getModelForPurpose: jest.fn(() => "gemini-3.0-flash"),
      getResearchTemperature: jest.fn(() => 0.2),
    } as unknown as jest.Mocked<AiConfigService>;

    service = new GeminiResearchServiceClass(
      providers as unknown as AiProviderService,
      aiConfig as unknown as AiConfigService,
    ) as unknown as GeminiResearchService;
  });

  it("uses generateText with google search tool and extracts deduped sources", async () => {
    generateTextMock.mockResolvedValueOnce({
      text: [
        "```json",
        JSON.stringify({
          marketReports: ["Gartner 2026"],
          competitors: [],
          marketTrends: ["Vertical AI"],
          marketSize: { tam: 1_000_000_000 },
          sources: ["https://existing.example.com"],
        }),
        "```",
      ].join("\n"),
      sources: [
        { title: "Top result", url: "https://search-a.example.com" },
      ],
      providerMetadata: {
        google: {
          groundingMetadata: {
            groundingChunks: [
              { web: { uri: "https://grounding-a.example.com", title: "Ground A" } },
              { web: { uri: "https://search-a.example.com", title: "Duplicate URL" } },
            ],
          },
        },
      },
    });

    const result = await service.research({
      agent: "market",
      prompt: "market prompt",
      systemPrompt: "market system",
      schema: MarketSchema,
      fallback: () => ({
        marketReports: [],
        competitors: [],
        marketTrends: [],
        marketSize: {},
        sources: ["https://fallback.example.com"],
      }),
    });

    expect(result.usedFallback).toBe(false);
    expect(result.error).toBeUndefined();
    expect(result.output.sources).toEqual([
      "https://existing.example.com",
      "https://search-a.example.com",
      "https://grounding-a.example.com",
    ]);
    expect(result.sources.map((source) => source.url)).toEqual([
      "https://search-a.example.com",
      "https://grounding-a.example.com",
    ]);
    expect(generateTextMock).toHaveBeenCalledTimes(1);
    expect(generateTextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        model: modelInstance,
        prompt: "market prompt",
        system: "market system",
        temperature: 0.2,
      }),
    );
    expect(googleSearchMock).toHaveBeenCalledTimes(1);
    expect(modelFactoryMock).toHaveBeenCalledWith("gemini-3.0-flash");
  });

  it("returns fallback with merged sources when grounded text cannot be parsed as schema JSON", async () => {
    generateTextMock.mockResolvedValueOnce({
      text: "This response did not return strict JSON.",
      sources: [{ title: "Source", url: "https://search-b.example.com" }],
      providerMetadata: {},
    });

    const result = await service.research({
      agent: "market",
      prompt: "market prompt",
      systemPrompt: "market system",
      schema: MarketSchema,
      fallback: () => ({
        marketReports: [],
        competitors: [],
        marketTrends: [],
        marketSize: {},
        sources: ["https://fallback.example.com"],
      }),
    });

    expect(result.usedFallback).toBe(true);
    expect(result.error).toContain("parseable JSON payload");
    expect(result.output.sources).toEqual([
      "https://fallback.example.com",
      "https://search-b.example.com",
    ]);
  });

  it("returns deterministic fallback when provider call throws", async () => {
    generateTextMock.mockRejectedValueOnce(new Error("provider timeout"));

    const result = await service.research({
      agent: "team",
      prompt: "team prompt",
      systemPrompt: "team system",
      schema: z.object({
        linkedinProfiles: z.array(z.object({ name: z.string() })),
        previousCompanies: z.array(z.string()),
        education: z.array(z.string()),
        achievements: z.array(z.string()),
        onlinePresence: z.object({ personalSites: z.array(z.string()) }),
        sources: z.array(z.string()),
      }),
      fallback: () => ({
        linkedinProfiles: [],
        previousCompanies: [],
        education: [],
        achievements: ["fallback"],
        onlinePresence: { personalSites: [] },
        sources: ["internal://fallback"],
      }),
    });

    expect(result.usedFallback).toBe(true);
    expect(result.error).toBe("provider timeout");
    expect(result.output.achievements).toEqual(["fallback"]);
    expect(result.sources[0]).toEqual(
      expect.objectContaining({
        type: "document",
        url: "internal://pipeline-state",
        agent: "team",
      }),
    );
  });
});
