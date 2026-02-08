import { beforeEach, describe, expect, it, jest } from "bun:test";
import { ResearchService } from "../../services/research.service";
import { PipelineStateService } from "../../services/pipeline-state.service";
import { GeminiResearchService } from "../../services/gemini-research.service";
import { PipelinePhase } from "../../interfaces/pipeline.interface";
import type {
  ExtractionResult,
  ScrapingResult,
  SourceEntry,
} from "../../interfaces/phase-results.interface";

describe("ResearchService", () => {
  let service: ResearchService;
  let pipelineState: jest.Mocked<PipelineStateService>;
  let geminiResearch: jest.Mocked<GeminiResearchService>;

  const extraction: ExtractionResult = {
    companyName: "Inside Line",
    tagline: "AI-native startup screening",
    founderNames: ["Alex"],
    industry: "SaaS",
    stage: "seed",
    location: "San Francisco, CA",
    website: "https://inside-line.test",
    fundingAsk: 1_500_000,
    rawText: "Inside Line automates diligence workflows for investors.",
  };

  const scraping: ScrapingResult = {
    website: null,
    websiteUrl: "https://inside-line.test",
    websiteSummary: "Workflow automation for investor teams.",
    teamMembers: [{ name: "Alex", role: "CEO", linkedinUrl: "https://linkedin.com/in/alex" }],
    notableClaims: ["Seed stage", "B2B SaaS"],
    scrapeErrors: [],
  };

  const source = (agent: SourceEntry["agent"]): SourceEntry => ({
    name: `${agent}-source`,
    url: `https://${agent}.example.com`,
    type: "search",
    agent,
    timestamp: new Date().toISOString(),
  });

  beforeEach(() => {
    pipelineState = {
      getPhaseResult: jest.fn().mockImplementation((_startupId: string, phase: PipelinePhase) => {
        if (phase === PipelinePhase.EXTRACTION) {
          return Promise.resolve(extraction);
        }

        if (phase === PipelinePhase.SCRAPING) {
          return Promise.resolve(scraping);
        }

        return Promise.resolve(null);
      }),
    } as unknown as jest.Mocked<PipelineStateService>;

    geminiResearch = {
      research: jest.fn().mockImplementation(({ agent }: { agent: SourceEntry["agent"] }) => {
        if (agent === "team") {
          return Promise.resolve({
            output: {
              linkedinProfiles: [],
              previousCompanies: [],
              education: [],
              achievements: ["Team profile data is limited"],
              onlinePresence: { personalSites: ["https://inside-line.test"] },
              sources: ["https://inside-line.test"],
            },
            sources: [source("team")],
            usedFallback: false,
          });
        }

        if (agent === "market") {
          return Promise.resolve({
            output: {
              marketReports: ["Report"],
              competitors: [],
              marketTrends: ["Trend"],
              marketSize: {},
              sources: ["https://market.example.com"],
            },
            sources: [source("market")],
            usedFallback: true,
            error: "Market provider timeout",
          });
        }

        if (agent === "product") {
          return Promise.resolve({
            output: {
              productPages: ["https://inside-line.test/product"],
              features: ["Automation"],
              techStack: ["TypeScript"],
              integrations: [],
              customerReviews: { sentiment: "positive", summary: "Strong" },
              sources: ["https://product.example.com"],
            },
            sources: [source("product"), source("team")],
            usedFallback: false,
          });
        }

        return Promise.resolve({
          output: {
            articles: [],
            pressReleases: ["Launch announcement"],
            sentiment: "neutral",
            recentEvents: ["No major events"],
            sources: ["https://news.example.com"],
          },
          sources: [source("news")],
          usedFallback: false,
        });
      }),
    } as unknown as jest.Mocked<GeminiResearchService>;

    service = new ResearchService(pipelineState, geminiResearch);
  });

  it("runs all 4 research agents and aggregates results with deduped sources", async () => {
    const result = await service.run("startup-1");

    expect(geminiResearch.research).toHaveBeenCalledTimes(4);
    expect(result.team).not.toBeNull();
    expect(result.market).not.toBeNull();
    expect(result.product).not.toBeNull();
    expect(result.news).not.toBeNull();
    expect(result.errors).toEqual([
      { agent: "market", error: "Market provider timeout" },
    ]);

    const urls = result.sources.map((entry) => entry.url);
    expect(new Set(urls).size).toBe(result.sources.length);
  });

  it("throws when required upstream phase results are missing", async () => {
    pipelineState.getPhaseResult.mockResolvedValueOnce(null as never);

    await expect(service.run("startup-1")).rejects.toThrow(
      "Research requires extraction and scraping results",
    );
  });

  it("captures per-agent errors when a research promise rejects", async () => {
    geminiResearch.research.mockImplementationOnce(() => {
      throw new Error("team lookup failed");
    });

    const result = await service.run("startup-1");

    expect(result.team).toBeNull();
    expect(result.market).not.toBeNull();
    expect(result.errors).toEqual(
      expect.arrayContaining([
        { agent: "team", error: "team lookup failed" },
      ]),
    );
  });
});
