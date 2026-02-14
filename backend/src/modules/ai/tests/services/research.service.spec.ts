import { beforeEach, describe, expect, it, jest } from "bun:test";
import { ResearchService } from "../../services/research.service";
import { PipelineStateService } from "../../services/pipeline-state.service";
import { GeminiResearchService } from "../../services/gemini-research.service";
import { PipelineFeedbackService } from "../../services/pipeline-feedback.service";
import { AiPromptService } from "../../services/ai-prompt.service";
import { PipelinePhase } from "../../interfaces/pipeline.interface";
import type {
  ExtractionResult,
  ResearchResult,
  ScrapingResult,
  SourceEntry,
} from "../../interfaces/phase-results.interface";

describe("ResearchService", () => {
  let service: ResearchService;
  let pipelineState: jest.Mocked<PipelineStateService>;
  let geminiResearch: jest.Mocked<GeminiResearchService>;
  let pipelineFeedback: jest.Mocked<PipelineFeedbackService>;
  let promptService: jest.Mocked<AiPromptService>;

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
    startupContext: {
      raiseType: "safe",
      previousFundingAmount: 500_000,
      technologyReadinessLevel: "mvp",
    },
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

        if (agent === "competitor") {
          return Promise.resolve({
            output: {
              competitors: [],
              indirectCompetitors: [],
              marketPositioning: "Positioned as vertical specialist",
              competitiveLandscapeSummary: "Fragmented market",
              sources: ["https://competitor.example.com"],
            },
            sources: [source("competitor")],
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

    pipelineFeedback = {
      getContext: jest.fn().mockResolvedValue({ items: [] }),
      markConsumedByScope: jest.fn().mockResolvedValue(0),
    } as unknown as jest.Mocked<PipelineFeedbackService>;

    promptService = {
      resolve: jest.fn().mockResolvedValue({
        key: "research.team",
        stage: "seed",
        systemPrompt: "test-system",
        userPrompt: "{{contextJson}}",
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

    service = new ResearchService(
      pipelineState,
      geminiResearch,
      pipelineFeedback,
      promptService,
    );
  });

  it("runs all 5 research agents and aggregates results with deduped sources", async () => {
    const result = await service.run("startup-1");

    expect(geminiResearch.research).toHaveBeenCalledTimes(5);
    expect(result.team).not.toBeNull();
    expect(result.market).not.toBeNull();
    expect(result.product).not.toBeNull();
    expect(result.news).not.toBeNull();
    expect(result.competitor).not.toBeNull();
    expect(result.errors).toEqual([
      { agent: "market", error: "Market provider timeout" },
    ]);

    const keys = result.sources.map((entry) => `${entry.agent}::${entry.url}`);
    expect(new Set(keys).size).toBe(result.sources.length);
  });

  it("injects startup form context into each agent prompt", async () => {
    await service.run("startup-1");

    const firstCall = geminiResearch.research.mock.calls[0]?.[0];
    expect(firstCall?.prompt).toContain("startupFormContext");
    expect(firstCall?.prompt).toContain("raiseType");
    expect(firstCall?.prompt).toContain("technologyReadinessLevel");
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

    expect(result.team).not.toBeNull();
    expect(result.market).not.toBeNull();
    expect(result.errors).toEqual(
      expect.arrayContaining([
        { agent: "team", error: "team lookup failed" },
      ]),
    );
  });

  it("reruns a single research agent and preserves previous outputs", async () => {
    const previous: ResearchResult = {
      team: {
        linkedinProfiles: [],
        previousCompanies: ["Company A"],
        education: [],
        achievements: ["Strong execution"],
        onlinePresence: { personalSites: [] },
        sources: [],
      },
      market: {
        marketReports: ["Old market report"],
        competitors: [],
        marketTrends: [],
        marketSize: {},
        sources: [],
      },
      product: {
        productPages: ["https://inside-line.test/product"],
        features: ["Automation"],
        techStack: ["TypeScript"],
        integrations: [],
        customerReviews: { sentiment: "positive", summary: "Strong" },
        sources: [],
      },
      news: {
        articles: [],
        pressReleases: [],
        sentiment: "neutral",
        recentEvents: [],
        sources: [],
      },
      competitor: null,
      sources: [source("team")],
      errors: [],
    };

    pipelineState.getPhaseResult.mockImplementation(
      (_startupId: string, phase: PipelinePhase) => {
        if (phase === PipelinePhase.EXTRACTION) {
          return Promise.resolve(extraction);
        }
        if (phase === PipelinePhase.SCRAPING) {
          return Promise.resolve(scraping);
        }
        if (phase === PipelinePhase.RESEARCH) {
          return Promise.resolve(previous);
        }
        return Promise.resolve(null);
      },
    );

    const result = await service.run("startup-1", { agentKey: "market" });

    expect(geminiResearch.research).toHaveBeenCalledTimes(1);
    expect(result.team).toEqual(previous.team);
    expect(result.product).toEqual(previous.product);
    expect(result.market).not.toEqual(previous.market);
  });

  it("replaces prior sources for a rerun agent and preserves other agent sources", async () => {
    const previous: ResearchResult = {
      team: null,
      market: null,
      product: null,
      news: null,
      competitor: null,
      sources: [
        {
          ...source("market"),
          name: "market-old",
          url: "https://market-old.example.com",
        },
        {
          ...source("team"),
          name: "team-old",
          url: "https://team-old.example.com",
        },
      ],
      errors: [],
    };

    pipelineState.getPhaseResult.mockImplementation(
      (_startupId: string, phase: PipelinePhase) => {
        if (phase === PipelinePhase.EXTRACTION) {
          return Promise.resolve(extraction);
        }
        if (phase === PipelinePhase.SCRAPING) {
          return Promise.resolve(scraping);
        }
        if (phase === PipelinePhase.RESEARCH) {
          return Promise.resolve(previous);
        }
        return Promise.resolve(null);
      },
    );

    const result = await service.run("startup-1", { agentKey: "market" });

    expect(result.sources.some((item) => item.url === "https://market-old.example.com")).toBe(false);
    expect(result.sources.some((item) => item.url === "https://team-old.example.com")).toBe(true);
    expect(result.sources.some((item) => item.agent === "market")).toBe(true);
  });

  it("consumes agent-level and phase-level feedback on successful targeted rerun", async () => {
    geminiResearch.research.mockResolvedValueOnce({
      output: {
        marketReports: ["Updated report"],
        competitors: [],
        marketTrends: [],
        marketSize: {},
        sources: ["https://market.example.com"],
      },
      sources: [source("market")],
      usedFallback: false,
    });

    pipelineState.getPhaseResult.mockImplementation(
      (_startupId: string, phase: PipelinePhase) => {
        if (phase === PipelinePhase.EXTRACTION) {
          return Promise.resolve(extraction);
        }
        if (phase === PipelinePhase.SCRAPING) {
          return Promise.resolve(scraping);
        }
        if (phase === PipelinePhase.RESEARCH) {
          return Promise.resolve({
            team: null,
            market: null,
            product: null,
            news: null,
            competitor: null,
            sources: [],
            errors: [],
          } satisfies ResearchResult);
        }
        return Promise.resolve(null);
      },
    );

    await service.run("startup-1", { agentKey: "market" });

    expect(pipelineFeedback.markConsumedByScope).toHaveBeenCalledWith({
      startupId: "startup-1",
      phase: PipelinePhase.RESEARCH,
      agentKey: "market",
    });
    expect(pipelineFeedback.markConsumedByScope).toHaveBeenCalledWith({
      startupId: "startup-1",
      phase: PipelinePhase.RESEARCH,
      agentKey: null,
    });
  });

  it("does not consume feedback when targeted rerun falls back", async () => {
    geminiResearch.research.mockResolvedValueOnce({
      output: {
        marketReports: [],
        competitors: [],
        marketTrends: [],
        marketSize: {},
        sources: [],
      },
      sources: [],
      usedFallback: true,
      error: "fallback",
    });

    pipelineState.getPhaseResult.mockImplementation(
      (_startupId: string, phase: PipelinePhase) => {
        if (phase === PipelinePhase.EXTRACTION) {
          return Promise.resolve(extraction);
        }
        if (phase === PipelinePhase.SCRAPING) {
          return Promise.resolve(scraping);
        }
        if (phase === PipelinePhase.RESEARCH) {
          return Promise.resolve({
            team: null,
            market: null,
            product: null,
            news: null,
            competitor: null,
            sources: [],
            errors: [],
          } satisfies ResearchResult);
        }
        return Promise.resolve(null);
      },
    );

    await service.run("startup-1", { agentKey: "market" });

    expect(pipelineFeedback.markConsumedByScope).not.toHaveBeenCalled();
  });
});
