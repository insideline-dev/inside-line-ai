import { beforeEach, describe, expect, it, jest, mock } from "bun:test";
import { zodResponseFormat } from "openai/helpers/zod";
import {
  ResearchParametersSchema,
  ResearchParametersService,
} from "../../services/research-parameters.service";
import type { AiProviderService } from "../../providers/ai-provider.service";
import type { AiConfigService } from "../../services/ai-config.service";
import type {
  ExtractionResult,
  ScrapingResult,
  EnrichmentResult,
} from "../../interfaces/phase-results.interface";
import type { ResearchParameters } from "../../interfaces/research-parameters.interface";

const mockGenerateText = jest.fn();
mock.module("ai", () => ({
  generateText: mockGenerateText,
  Output: {
    object: jest.fn().mockImplementation(({ schema }) => ({ type: "object", schema })),
  },
}));

describe("ResearchParametersService", () => {
  let service: ResearchParametersService;
  let aiProvider: { resolveModelForPurpose: ReturnType<typeof jest.fn> };
  let aiConfig: { getModelForPurpose: ReturnType<typeof jest.fn> };

  const extraction: ExtractionResult = {
    companyName: "TestCo",
    tagline: "AI-powered testing",
    founderNames: ["Jane Doe"],
    industry: "Developer Tools",
    stage: "seed",
    location: "San Francisco, CA",
    website: "https://testco.dev",
    rawText: "TestCo builds AI-powered testing tools for developers.",
    startupContext: {
      teamMembers: [{ name: "Jane Doe", role: "CEO" }],
    },
  };

  const scraping: ScrapingResult = {
    website: {
      url: "https://testco.dev",
      title: "TestCo",
      description: "AI testing platform",
      fullText: "TestCo provides automated testing solutions powered by AI.",
      headings: ["Product", "Team"],
      subpages: [],
      links: [],
      teamBios: [],
      customerLogos: [],
      testimonials: [],
      metadata: {
        scrapedAt: new Date().toISOString(),
        pageCount: 3,
        hasAboutPage: true,
        hasTeamPage: true,
        hasPricingPage: false,
      },
    },
    websiteUrl: "https://testco.dev",
    teamMembers: [
      {
        name: "Jane Doe",
        role: "CEO",
        linkedinUrl: "https://linkedin.com/in/janedoe",
        enrichmentStatus: "success",
      },
    ],
    notableClaims: ["Series A ready"],
    scrapeErrors: [],
  };

  const mockAiOutput = {
    specificMarket: "AI-powered developer testing tools",
    productDescription: "TestCo builds automated testing tools using AI to help developers ship faster.",
    targetCustomers: "Mid-market SaaS companies with engineering teams of 10-50",
    knownCompetitors: ["Copilot", "Cursor", "Tabnine"],
    geographicFocus: "United States, Europe",
    businessModel: "SaaS with per-seat pricing",
    fundingStage: "seed",
    claimedMetrics: {
      tam: "$5B developer tools market",
      growthRate: "40% YoY",
      revenue: null,
      customers: "50+ beta customers",
    },
  };

  beforeEach(() => {
    mockGenerateText.mockReset();

    aiProvider = {
      resolveModelForPurpose: jest.fn().mockReturnValue("mock-model"),
    };
    aiConfig = {
      getModelForPurpose: jest.fn().mockReturnValue("gemini-2.5-flash"),
    };

    service = new ResearchParametersService(
      aiProvider as unknown as AiProviderService,
      aiConfig as unknown as AiConfigService,
    );
  });

  it("generates research parameters from AI output", async () => {
    mockGenerateText.mockResolvedValueOnce({
      experimental_output: mockAiOutput,
    });

    const result = await service.generate(extraction, scraping);

    expect(result.companyName).toBe("TestCo");
    expect(result.sector).toBe("Developer Tools");
    expect(result.specificMarket).toBe("AI-powered developer testing tools");
    expect(result.knownCompetitors).toEqual(["Copilot", "Cursor", "Tabnine"]);
    expect(result.claimedMetrics.tam).toBe("$5B developer tools market");
    expect(result.claimedMetrics.revenue).toBeUndefined();
    expect(result.teamMembers.length).toBeGreaterThan(0);
    expect(result.teamMembers[0]?.name).toBe("Jane Doe");
  });

  it("returns fallback when AI provider is not available", async () => {
    const serviceNoProvider = new ResearchParametersService();

    const result = await serviceNoProvider.generate(extraction, scraping);

    expect(result.companyName).toBe("TestCo");
    expect(result.specificMarket).toBe("Developer Tools");
    expect(result.productDescription).toBe("");
    expect(result.knownCompetitors).toEqual([]);
    expect(result.geographicFocus).toBe("United States");
    expect(result.businessModel).toBe("SaaS");
  });

  it("returns fallback when AI call fails", async () => {
    mockGenerateText.mockRejectedValueOnce(new Error("Model rate limited"));

    const result = await service.generate(extraction, scraping);

    expect(result.companyName).toBe("TestCo");
    expect(result.specificMarket).toBe("Developer Tools");
    expect(result.knownCompetitors).toEqual([]);
  });

  it("returns fallback when AI returns empty output", async () => {
    mockGenerateText.mockResolvedValueOnce({
      experimental_output: null,
    });

    const result = await service.generate(extraction, scraping);

    expect(result.companyName).toBe("TestCo");
    expect(result.specificMarket).toBe("Developer Tools");
  });

  it("merges team members from scraping, extraction context, and enrichment", async () => {
    mockGenerateText.mockResolvedValueOnce({
      experimental_output: mockAiOutput,
    });

    const enrichment: EnrichmentResult = {
      discoveredFounders: [
        { name: "John Smith", role: "CTO", confidence: 0.9 },
        { name: "Low Conf Person", role: "Intern", confidence: 0.3 },
      ],
      fundingHistory: [],
      pitchDeckUrls: [],
      socialProfiles: {},
      productSignals: {},
      tractionSignals: {},
      fieldsEnriched: [],
      fieldsStillMissing: [],
      fieldsCorrected: [],
      correctionDetails: [],
      sources: [],
      dbFieldsUpdated: [],
    };

    const result = await service.generate(extraction, scraping, enrichment);

    const names = result.teamMembers.map((m) => m.name);
    expect(names).toContain("Jane Doe");
    expect(names).toContain("John Smith");
    expect(names).not.toContain("Low Conf Person");
  });

  it("conforms to ResearchParameters interface shape", async () => {
    mockGenerateText.mockResolvedValueOnce({
      experimental_output: mockAiOutput,
    });

    const result: ResearchParameters = await service.generate(extraction, scraping);

    expect(typeof result.companyName).toBe("string");
    expect(typeof result.sector).toBe("string");
    expect(typeof result.specificMarket).toBe("string");
    expect(typeof result.productDescription).toBe("string");
    expect(typeof result.targetCustomers).toBe("string");
    expect(Array.isArray(result.knownCompetitors)).toBe(true);
    expect(typeof result.geographicFocus).toBe("string");
    expect(typeof result.businessModel).toBe("string");
    expect(typeof result.fundingStage).toBe("string");
    expect(Array.isArray(result.teamMembers)).toBe(true);
    expect(typeof result.claimedMetrics).toBe("object");
  });

  it("uses an OpenAI-strict schema for claimed metrics structured output", () => {
    expect(() => zodResponseFormat(ResearchParametersSchema, "response")).not.toThrow();
  });

  it("reports fallback metadata when provider schema generation fails", async () => {
    mockGenerateText.mockRejectedValueOnce(
      new Error(
        "Invalid schema for response_format 'response': In context=('properties', 'claimedMetrics'), 'required' is required to be supplied and to be an array including every key in properties. Missing 'tam'.",
      ),
    );

    let meta:
      | {
          usedFallback: boolean;
          error?: string;
          fallbackReason?: string;
          rawProviderError?: string;
        }
      | undefined;

    await service.generate(extraction, scraping, undefined, {
      onComplete: (payload) => {
        meta = payload;
      },
    });

    expect(meta?.usedFallback).toBe(true);
    expect(meta?.fallbackReason).toBe("MODEL_OR_PROVIDER_ERROR");
    expect(meta?.rawProviderError).toContain("Missing 'tam'");
  });
});
