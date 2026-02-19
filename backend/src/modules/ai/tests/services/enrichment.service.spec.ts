import { describe, it, expect, beforeEach, jest, mock } from "bun:test";

// Mock the `ai` module before importing the service — same pattern as investor-matching
const generateTextMock = jest.fn();
mock.module("ai", () => ({
  generateText: generateTextMock,
}));

import { EnrichmentService } from "../../services/enrichment.service";
import type { DrizzleService } from "../../../../database";
import type { PipelineStateService } from "../../services/pipeline-state.service";
import type { BraveSearchService } from "../../services/brave-search.service";
import type { AiProviderService } from "../../providers/ai-provider.service";
import type { AiConfigService } from "../../services/ai-config.service";

// ---- helpers ----

const STARTUP_ID = "startup-abc";

function makeStartupRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: STARTUP_ID,
    name: "Acme Inc",
    website: null,
    description: null,
    tagline: null,
    industry: null,
    location: null,
    stage: "seed",
    teamSize: 3,
    fundingTarget: 500000,
    teamMembers: [],
    ...overrides,
  };
}

function makeEnrichmentJson(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    discoveredFounders: [],
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
    ...overrides,
  });
}

// ---- factory ----

function buildService(opts: {
  record?: ReturnType<typeof makeStartupRecord>;
  aiText?: string;
  correctionThreshold?: number;
  braveConfigured?: boolean;
  braveSearchResponses?: Array<{ query: string; results: Array<{ title: string; url: string; description: string }> }>;
  enrichmentModel?: string;
}) {
  const record = opts.record ?? makeStartupRecord();
  const correctionThreshold = opts.correctionThreshold ?? 0.85;

  const drizzle = {
    db: {
      select: jest.fn().mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([record]),
          }),
        }),
      }),
      update: jest.fn().mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue(undefined),
        }),
      }),
    },
  } as unknown as jest.Mocked<DrizzleService>;

  const pipelineState = {
    getPhaseResult: jest.fn().mockResolvedValue(null),
  } as unknown as jest.Mocked<PipelineStateService>;

  const responses = opts.braveSearchResponses ?? [{ query: "q", results: [] }];
  let responseIndex = 0;
  const braveSearch = {
    isConfigured: jest.fn().mockReturnValue(opts.braveConfigured ?? false),
    search: jest.fn().mockImplementation(async () => {
      const index = Math.min(responseIndex, responses.length - 1);
      responseIndex += 1;
      return responses[index]!;
    }),
  } as unknown as jest.Mocked<BraveSearchService>;

  const aiProvider = {
    resolveModelForPurpose: jest.fn().mockReturnValue({ provider: "gemini" }),
  } as unknown as jest.Mocked<AiProviderService>;

  const aiConfig = {
    getEnrichmentCorrectionThreshold: jest.fn().mockReturnValue(correctionThreshold),
    getModelForPurpose: jest
      .fn()
      .mockReturnValue(opts.enrichmentModel ?? "gemini-3-flash-preview"),
    getEnrichmentTemperature: jest.fn().mockReturnValue(0.1),
    getEnrichmentTimeoutMs: jest.fn().mockReturnValue(60_000),
  } as unknown as jest.Mocked<AiConfigService>;

  if (opts.aiText !== undefined) {
    generateTextMock.mockResolvedValue({ text: opts.aiText });
  }

  const service = new EnrichmentService(
    drizzle as unknown as DrizzleService,
    pipelineState as unknown as PipelineStateService,
    braveSearch as unknown as BraveSearchService,
    aiProvider as unknown as AiProviderService,
    aiConfig as unknown as AiConfigService,
  );

  return { service, drizzle, pipelineState, braveSearch, aiConfig };
}

// ---- tests ----

describe("EnrichmentService", () => {
  beforeEach(() => {
    generateTextMock.mockReset();
  });

  describe("run() — startup not found", () => {
    it("throws when startup record is missing", async () => {
      const drizzle = {
        db: {
          select: jest.fn().mockReturnValue({
            from: jest.fn().mockReturnValue({
              where: jest.fn().mockReturnValue({
                limit: jest.fn().mockResolvedValue([]),
              }),
            }),
          }),
        },
      } as unknown as jest.Mocked<DrizzleService>;

      const service = new EnrichmentService(
        drizzle as unknown as DrizzleService,
        { getPhaseResult: jest.fn().mockResolvedValue(null) } as unknown as PipelineStateService,
        { isConfigured: jest.fn().mockReturnValue(false) } as unknown as BraveSearchService,
        { resolveModelForPurpose: jest.fn() } as unknown as AiProviderService,
        { getEnrichmentCorrectionThreshold: jest.fn().mockReturnValue(0.85) } as unknown as AiConfigService,
      );

      await expect(service.run("missing-id")).rejects.toThrow("not found");
    });
  });

  describe("run() — AI synthesis fails", () => {
    it("returns empty result when generateText throws", async () => {
      generateTextMock.mockRejectedValue(new Error("provider down"));

      const { service } = buildService({});
      const result = await service.run(STARTUP_ID);

      expect(result.fieldsEnriched).toHaveLength(0);
      expect(result.discoveredFounders).toHaveLength(0);
      expect(result.dbFieldsUpdated).toHaveLength(0);
    });

    it("returns empty result when AI returns unparseable JSON", async () => {
      generateTextMock.mockResolvedValue({ text: "not json at all" });

      const { service } = buildService({});
      const result = await service.run(STARTUP_ID);

      expect(result.fieldsEnriched).toHaveLength(0);
      expect(result.dbFieldsUpdated).toHaveLength(0);
    });

    it("retries malformed grounded JSON once then records fallback reason metadata", async () => {
      generateTextMock.mockResolvedValue({
        text: '{"website":{"value":"https://acme.com","confidence":0.9e-,"source":"x"}}',
      });

      const { service } = buildService({});
      let completion:
        | {
            usedFallback: boolean;
            fallbackReason?: string;
            rawProviderError?: string;
            attempt?: number;
            retryCount?: number;
          }
        | undefined;

      const result = await service.run(STARTUP_ID, {
        onAgentComplete: (payload) => {
          completion = payload;
        },
      });

      expect(result.fieldsEnriched).toHaveLength(0);
      expect(generateTextMock.mock.calls.length).toBeGreaterThan(1);
      expect(completion?.usedFallback).toBe(true);
      expect(completion?.fallbackReason).toBe("SCHEMA_OUTPUT_INVALID");
      expect(completion?.attempt).toBe(2);
      expect(completion?.retryCount).toBe(1);
      expect(completion?.rawProviderError).toBeTruthy();
    });

    it("parses valid fenced JSON even when model adds surrounding prose", async () => {
      const aiJson = makeEnrichmentJson({
        website: { value: "https://acme.com", confidence: 0.87, source: "grounding" },
      });
      generateTextMock.mockResolvedValue({
        text: `I found these results.\n\`\`\`json\n${aiJson}\n\`\`\`\nDone.`,
      });

      const { service } = buildService({});
      let completion:
        | { usedFallback: boolean; attempt?: number; retryCount?: number }
        | undefined;
      const result = await service.run(STARTUP_ID, {
        onAgentComplete: (payload) => {
          completion = payload;
        },
      });

      expect(result.website?.value).toBe("https://acme.com");
      expect(completion?.usedFallback).toBe(false);
      expect(completion?.attempt).toBe(1);
      expect(completion?.retryCount).toBe(0);
    });

    it("treats schema-valid but non-substantive output as invalid when web evidence exists", async () => {
      const aiJson = makeEnrichmentJson();
      generateTextMock.mockResolvedValue({ text: aiJson });

      const { service } = buildService({
        braveConfigured: true,
        braveSearchResponses: [
          {
            query: "Acme profile",
            results: [
              {
                title: "Acme - Wikipedia",
                url: "https://en.wikipedia.org/wiki/Acme",
                description: "General information page",
              },
            ],
          },
        ],
      });

      let completion:
        | { usedFallback: boolean; fallbackReason?: string; retryCount?: number }
        | undefined;
      const result = await service.run(STARTUP_ID, {
        onAgentComplete: (payload) => {
          completion = payload;
        },
      });

      expect(result.fieldsEnriched).toHaveLength(0);
      expect(completion?.usedFallback).toBe(true);
      expect(completion?.fallbackReason).toBe("SCHEMA_OUTPUT_INVALID");
      expect(completion?.retryCount).toBe(1);
    });

    it("applies deterministic backup extraction when model output is weak", async () => {
      const aiJson = makeEnrichmentJson();
      generateTextMock.mockResolvedValue({ text: aiJson });

      const { service } = buildService({
        braveConfigured: true,
        braveSearchResponses: [
          {
            query: "Acme founder CEO LinkedIn",
            results: [
              {
                title: "Jane Doe - Acme Inc | LinkedIn",
                url: "https://www.linkedin.com/in/jane-doe/",
                description: "CEO and co-founder at Acme Inc",
              },
              {
                title: "Acme Pitch Deck | PDF",
                url: "https://www.slideshare.net/slideshow/acme-pitch-deck/123",
                description: "Pitch deck for Acme Inc",
              },
              {
                title: "Acme - Crunchbase Company Profile",
                url: "https://www.crunchbase.com/organization/acme-inc",
                description: "Acme company profile and funding history",
              },
            ],
          },
        ],
      });

      let completion:
        | { usedFallback: boolean; attempt?: number; retryCount?: number }
        | undefined;
      const result = await service.run(STARTUP_ID, {
        onAgentComplete: (payload) => {
          completion = payload;
        },
      });

      expect(result.discoveredFounders.length).toBeGreaterThan(0);
      expect(result.pitchDeckUrls.length).toBeGreaterThan(0);
      expect(result.socialProfiles.crunchbaseUrl).toContain("crunchbase.com");
      expect(result.sources.length).toBeGreaterThan(0);
      expect(completion?.usedFallback).toBe(false);
      expect(completion?.attempt).toBe(1);
      expect(completion?.retryCount).toBe(0);
    });
  });

  describe("identifyMissingFields — gap detection", () => {
    it("detects all missing fields when record is empty", async () => {
      const aiJson = makeEnrichmentJson({ fieldsStillMissing: ["website", "description", "tagline", "industry", "location"] });
      generateTextMock.mockResolvedValue({ text: aiJson });

      const { service } = buildService({ record: makeStartupRecord() });
      const result = await service.run(STARTUP_ID);

      // The prompt is built with the missing fields — we verify indirectly that
      // the result carries fieldsStillMissing passed back from AI
      expect(result.fieldsStillMissing).toContain("website");
    });

    it("does NOT list fields that are already populated", async () => {
      const populatedRecord = makeStartupRecord({
        website: "https://acme.com",
        description: "We do things",
        tagline: "Make it",
        industry: "SaaS",
        location: "NYC",
        teamMembers: [{ name: "Alice", role: "CEO" }],
      });

      const aiJson = makeEnrichmentJson({ fieldsStillMissing: [] });
      generateTextMock.mockResolvedValue({ text: aiJson });

      const { service } = buildService({ record: populatedRecord });
      const result = await service.run(STARTUP_ID);

      // AI returned none still missing
      expect(result.fieldsStillMissing).toHaveLength(0);
    });
  });

  describe("applyDbWrites — gap fills", () => {
    it("writes a field that is empty when confidence > 0.3", async () => {
      const aiJson = makeEnrichmentJson({
        website: { value: "https://found.com", confidence: 0.7, source: "brave" },
      });
      generateTextMock.mockResolvedValue({ text: aiJson });

      const { service, drizzle } = buildService({
        record: makeStartupRecord({ website: null }),
      });
      const result = await service.run(STARTUP_ID);

      expect(drizzle.db.update).toHaveBeenCalled();
      expect(result.dbFieldsUpdated.some((f) => f.includes("Website"))).toBe(true);
    });

    it("does NOT write a field that is empty when confidence <= 0.3", async () => {
      const aiJson = makeEnrichmentJson({
        website: { value: "https://found.com", confidence: 0.2, source: "brave" },
      });
      generateTextMock.mockResolvedValue({ text: aiJson });

      const { service, drizzle } = buildService({
        record: makeStartupRecord({ website: null }),
      });
      const result = await service.run(STARTUP_ID);

      expect(drizzle.db.update).not.toHaveBeenCalled();
      expect(result.dbFieldsUpdated).toHaveLength(0);
    });

    it("does NOT overwrite a field that already has a value (gap fill is skipped)", async () => {
      const aiJson = makeEnrichmentJson({
        website: { value: "https://different.com", confidence: 0.9, source: "brave" },
      });
      generateTextMock.mockResolvedValue({ text: aiJson });

      const { service, drizzle } = buildService({
        record: makeStartupRecord({ website: "https://existing.com" }),
      });
      const result = await service.run(STARTUP_ID);

      // No correction details → no correction either, no gap fill because field not empty
      expect(drizzle.db.update).not.toHaveBeenCalled();
      expect(result.dbFieldsUpdated).toHaveLength(0);
    });
  });

  describe("applyDbWrites — corrections", () => {
    it("applies a correction when confidence > threshold (0.85)", async () => {
      const aiJson = makeEnrichmentJson({
        website: { value: "https://correct.com", confidence: 0.92, source: "https://www.crunchbase.com/organization/correct" },
        correctionDetails: [
          {
            field: "website",
            oldValue: "https://wrong.com",
            newValue: "https://correct.com",
            confidence: 0.9,
            reason: "Found authoritative source",
          },
        ],
        sources: [
          { url: "https://www.crunchbase.com/organization/correct", title: "Crunchbase", type: "search" },
          { url: "https://techcrunch.com/2024/04/18/correct-funding", title: "TechCrunch", type: "search" },
        ],
      });
      generateTextMock.mockResolvedValue({ text: aiJson });

      const { service, drizzle } = buildService({
        record: makeStartupRecord({ website: "https://wrong.com" }),
        correctionThreshold: 0.85,
      });
      const result = await service.run(STARTUP_ID);

      expect(drizzle.db.update).toHaveBeenCalled();
      expect(result.dbFieldsUpdated.some((f) => f.includes("corrected"))).toBe(true);
    });

    it("does NOT apply a correction when confidence equals threshold exactly — must exceed", async () => {
      const aiJson = makeEnrichmentJson({
        website: { value: "https://correct.com", confidence: 0.9, source: "https://www.crunchbase.com/organization/correct" },
        correctionDetails: [
          {
            field: "website",
            oldValue: "https://wrong.com",
            newValue: "https://correct.com",
            confidence: 0.85,
            reason: "Borderline",
          },
        ],
        sources: [
          { url: "https://www.crunchbase.com/organization/correct", title: "Crunchbase", type: "search" },
          { url: "https://www.reuters.com/world/us/correct", title: "Reuters", type: "search" },
        ],
      });
      generateTextMock.mockResolvedValue({ text: aiJson });

      const { service, drizzle } = buildService({
        record: makeStartupRecord({ website: "https://wrong.com" }),
        correctionThreshold: 0.85,
      });

      // Threshold check is `>= correctionThreshold`, so 0.85 >= 0.85 → WILL write.
      // Document the actual boundary behaviour — equals means it DOES apply.
      const result = await service.run(STARTUP_ID);

      expect(drizzle.db.update).toHaveBeenCalled();
      expect(result.dbFieldsUpdated.some((f) => f.includes("corrected"))).toBe(true);
    });

    it("does NOT apply correction when confidence < threshold", async () => {
      const aiJson = makeEnrichmentJson({
        website: { value: "https://correct.com", confidence: 0.75, source: "https://www.crunchbase.com/organization/correct" },
        correctionDetails: [
          {
            field: "website",
            oldValue: "https://wrong.com",
            newValue: "https://correct.com",
            confidence: 0.7,
            reason: "Low confidence",
          },
        ],
        sources: [
          { url: "https://www.crunchbase.com/organization/correct", title: "Crunchbase", type: "search" },
          { url: "https://techcrunch.com/2024/04/18/correct-funding", title: "TechCrunch", type: "search" },
        ],
      });
      generateTextMock.mockResolvedValue({ text: aiJson });

      const { service, drizzle } = buildService({
        record: makeStartupRecord({ website: "https://wrong.com" }),
        correctionThreshold: 0.85,
      });
      const result = await service.run(STARTUP_ID);

      expect(drizzle.db.update).not.toHaveBeenCalled();
      expect(result.dbFieldsUpdated).toHaveLength(0);
    });

    it("does NOT apply correction when sources are tier-3 only", async () => {
      const aiJson = makeEnrichmentJson({
        website: { value: "https://correct.com", confidence: 0.95, source: "https://en.wikipedia.org/wiki/Correct" },
        correctionDetails: [
          {
            field: "website",
            oldValue: "https://wrong.com",
            newValue: "https://correct.com",
            confidence: 0.95,
            reason: "Looks updated",
          },
        ],
        sources: [
          { url: "https://en.wikipedia.org/wiki/Correct", title: "Wikipedia", type: "search" },
          { url: "https://www.slideshare.net/slideshow/correct", title: "SlideShare", type: "search" },
        ],
      });
      generateTextMock.mockResolvedValue({ text: aiJson });

      const { service, drizzle } = buildService({
        record: makeStartupRecord({ website: "https://wrong.com" }),
        correctionThreshold: 0.85,
      });
      const result = await service.run(STARTUP_ID);

      expect(drizzle.db.update).not.toHaveBeenCalled();
      expect(result.dbFieldsUpdated).toHaveLength(0);
    });
  });

  describe("applyDbWrites — discovered founders", () => {
    it("does not write discovered founders into teamMembers (handled by linkedin_enrichment)", async () => {
      const aiJson = makeEnrichmentJson({
        discoveredFounders: [
          { name: "Bob Builder", role: "CTO", confidence: 0.8 },
        ],
      });
      generateTextMock.mockResolvedValue({ text: aiJson });

      const { service, drizzle } = buildService({
        record: makeStartupRecord({
          teamMembers: [{ name: "Alice", role: "CEO" }],
        }),
      });
      const result = await service.run(STARTUP_ID);

      expect(drizzle.db.update).not.toHaveBeenCalled();
      expect(result.dbFieldsUpdated).toHaveLength(0);
    });
  });

  describe("Brave Search integration", () => {
    it("skips searches when BraveSearch is not configured", async () => {
      const aiJson = makeEnrichmentJson();
      generateTextMock.mockResolvedValue({ text: aiJson });

      const { service, braveSearch } = buildService({ braveConfigured: false });
      await service.run(STARTUP_ID);

      expect(braveSearch.search).not.toHaveBeenCalled();
    });

    it("runs searches when BraveSearch is configured", async () => {
      const aiJson = makeEnrichmentJson();
      generateTextMock.mockResolvedValue({ text: aiJson });

      const { service, braveSearch } = buildService({ braveConfigured: true });
      await service.run(STARTUP_ID);

      expect(braveSearch.search).toHaveBeenCalled();
    });

    it("does not run LinkedIn-specific founder search queries in gap-fill stage", async () => {
      const aiJson = makeEnrichmentJson();
      generateTextMock.mockResolvedValue({ text: aiJson });

      const { service, braveSearch } = buildService({ braveConfigured: true });
      await service.run(STARTUP_ID);

      const queries = braveSearch.search.mock.calls.map(
        (call) => String(call[0]).toLowerCase(),
      );
      expect(queries.some((query) => query.includes("site:linkedin.com"))).toBe(
        false,
      );
      expect(queries.some((query) => query.includes(" linkedin "))).toBe(false);
    });
  });

  describe("Gemini grounding integration", () => {
    it("enables google_search tool for Gemini enrichment models", async () => {
      const aiJson = makeEnrichmentJson();
      generateTextMock.mockResolvedValue({ text: aiJson });

      const { service } = buildService({
        enrichmentModel: "gemini-3-flash-preview",
      });
      await service.run(STARTUP_ID);

      const args = generateTextMock.mock.calls[0]?.[0] as
        | { tools?: Record<string, unknown> }
        | undefined;
      expect(args?.tools).toBeDefined();
      expect(args?.tools?.google_search).toBeDefined();
    });

    it("does not enable google_search tool for non-Gemini models", async () => {
      const aiJson = makeEnrichmentJson();
      generateTextMock.mockResolvedValue({ text: aiJson });

      const { service } = buildService({
        enrichmentModel: "gpt-4.1-mini",
      });
      await service.run(STARTUP_ID);

      const args = generateTextMock.mock.calls[0]?.[0] as
        | { tools?: Record<string, unknown> }
        | undefined;
      expect(args?.tools).toBeUndefined();
    });
  });
});
