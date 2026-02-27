import { beforeEach, describe, expect, it, jest } from "bun:test";
import { ResearchService } from "../../services/research.service";
import { PipelineStateService } from "../../services/pipeline-state.service";
import { GeminiResearchService } from "../../services/gemini-research.service";
import { PipelineFeedbackService } from "../../services/pipeline-feedback.service";
import { ResearchParametersService } from "../../services/research-parameters.service";
import { AiPromptService } from "../../services/ai-prompt.service";
import { PipelinePhase } from "../../interfaces/pipeline.interface";
import { AiConfigService } from "../../services/ai-config.service";
import { AiModelExecutionService } from "../../services/ai-model-execution.service";
import type {
  ExtractionResult,
  ResearchResult,
  ScrapingResult,
  SourceEntry,
} from "../../interfaces/phase-results.interface";
import type { ResearchParameters } from "../../interfaces/research-parameters.interface";

describe("ResearchService", () => {
  let service: ResearchService;
  let pipelineState: jest.Mocked<PipelineStateService>;
  let geminiResearch: jest.Mocked<GeminiResearchService>;
  let pipelineFeedback: jest.Mocked<PipelineFeedbackService>;
  let researchParametersService: jest.Mocked<ResearchParametersService>;
  let promptService: jest.Mocked<AiPromptService>;
  let aiConfig: jest.Mocked<AiConfigService>;

  const mockResearchParameters: ResearchParameters = {
    companyName: "Inside Line",
    sector: "SaaS",
    specificMarket: "AI-powered startup screening and diligence",
    productDescription: "Inside Line automates diligence workflows for investor teams.",
    targetCustomers: "Venture capital firms and angel investors",
    knownCompetitors: ["Harmonic", "Affinity"],
    geographicFocus: "United States",
    businessModel: "SaaS",
    fundingStage: "seed",
    teamMembers: [{ name: "Alex", role: "CEO" }],
    claimedMetrics: {},
  };

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
      researchText: jest.fn().mockImplementation(({ agent }: { agent: SourceEntry["agent"] }) => {
        if (agent === "market") {
          return Promise.resolve({
            output: "Market report text",
            sources: [source("market")],
            usedFallback: true,
            error: "Market provider timeout",
          });
        }

        return Promise.resolve({
          output: `${agent} report text`,
          sources: [source(agent)],
          usedFallback: false,
        });
      }),
    } as unknown as jest.Mocked<GeminiResearchService>;

    pipelineFeedback = {
      getContext: jest.fn().mockResolvedValue({ items: [] }),
      markConsumedByScope: jest.fn().mockResolvedValue(0),
    } as unknown as jest.Mocked<PipelineFeedbackService>;

    researchParametersService = {
      generate: jest.fn().mockResolvedValue(mockResearchParameters),
    } as unknown as jest.Mocked<ResearchParametersService>;

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

    aiConfig = {
      getResearchAgentStaggerMs: jest.fn().mockReturnValue(0),
    } as unknown as jest.Mocked<AiConfigService>;

    service = new ResearchService(
      pipelineState,
      geminiResearch,
      pipelineFeedback,
      promptService,
      researchParametersService,
      undefined,
      aiConfig,
    );
  });

  it("runs all research agents and returns text-only reports with combinedReportText", async () => {
    const result = await service.run("startup-1");

    expect(geminiResearch.researchText).toHaveBeenCalledTimes(5);
    expect(result.team).toBe("team report text");
    expect(result.market).toBe("Market report text");
    expect(result.product).toBe("product report text");
    expect(result.news).toBe("news report text");
    expect(result.competitor).toBe("competitor report text");
    expect(result.combinedReportText).toContain("Team Research Report");
    expect(result.errors).toEqual([{ agent: "market", error: "Market provider timeout" }]);

    const keys = result.sources.map((entry) => `${entry.agent}::${entry.url}`);
    expect(new Set(keys).size).toBe(result.sources.length);
  });

  it("injects startup form context into each agent prompt", async () => {
    await service.run("startup-1");

    const firstCall = geminiResearch.researchText.mock.calls[0]?.[0];
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

  it("reruns a single research agent and preserves previous outputs", async () => {
    const previous: ResearchResult = {
      team: "old-team",
      market: "old-market",
      product: "old-product",
      news: "old-news",
      competitor: "old-competitor",
      combinedReportText: "old-combined",
      sources: [source("team")],
      errors: [],
    };

    pipelineState.getPhaseResult.mockImplementation(
      (_startupId: string, phase: PipelinePhase) => {
        if (phase === PipelinePhase.EXTRACTION) return Promise.resolve(extraction);
        if (phase === PipelinePhase.SCRAPING) return Promise.resolve(scraping);
        if (phase === PipelinePhase.RESEARCH) return Promise.resolve(previous);
        return Promise.resolve(null);
      },
    );

    const result = await service.run("startup-1", { agentKey: "market" });

    expect(geminiResearch.researchText).toHaveBeenCalledTimes(1);
    expect(result.team).toBe("old-team");
    expect(result.product).toBe("old-product");
    expect(result.market).toBe("Market report text");
    expect(result.combinedReportText).toContain("Market Research Report");
  });

  it("replaces prior sources for a rerun agent and preserves other agent sources", async () => {
    const previous: ResearchResult = {
      team: null,
      market: null,
      product: null,
      news: null,
      competitor: null,
      combinedReportText: "",
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
        if (phase === PipelinePhase.EXTRACTION) return Promise.resolve(extraction);
        if (phase === PipelinePhase.SCRAPING) return Promise.resolve(scraping);
        if (phase === PipelinePhase.RESEARCH) return Promise.resolve(previous);
        return Promise.resolve(null);
      },
    );

    const result = await service.run("startup-1", { agentKey: "market" });

    expect(result.sources.some((item) => item.url === "https://market-old.example.com")).toBe(false);
    expect(result.sources.some((item) => item.url === "https://team-old.example.com")).toBe(true);
    expect(result.sources.some((item) => item.agent === "market")).toBe(true);
  });

  it("consumes agent-level and phase-level feedback on successful targeted rerun", async () => {
    geminiResearch.researchText.mockResolvedValueOnce({
      output: "Updated market report",
      sources: [source("market")],
      usedFallback: false,
    });

    pipelineState.getPhaseResult.mockImplementation(
      (_startupId: string, phase: PipelinePhase) => {
        if (phase === PipelinePhase.EXTRACTION) return Promise.resolve(extraction);
        if (phase === PipelinePhase.SCRAPING) return Promise.resolve(scraping);
        if (phase === PipelinePhase.RESEARCH) {
          return Promise.resolve({
            team: null,
            market: null,
            product: null,
            news: null,
            competitor: null,
            combinedReportText: "",
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
    geminiResearch.researchText.mockResolvedValueOnce({
      output: "Fallback market report",
      sources: [],
      usedFallback: true,
      error: "fallback",
    });

    pipelineState.getPhaseResult.mockImplementation(
      (_startupId: string, phase: PipelinePhase) => {
        if (phase === PipelinePhase.EXTRACTION) return Promise.resolve(extraction);
        if (phase === PipelinePhase.SCRAPING) return Promise.resolve(scraping);
        if (phase === PipelinePhase.RESEARCH) {
          return Promise.resolve({
            team: null,
            market: null,
            product: null,
            news: null,
            competitor: null,
            combinedReportText: "",
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

  it("calls researchParametersService.generate before dispatching agents", async () => {
    const callOrder: string[] = [];
    researchParametersService.generate.mockImplementation(async () => {
      callOrder.push("researchParameters");
      return mockResearchParameters;
    });

    const origResearch = geminiResearch.researchText.getMockImplementation()!;
    geminiResearch.researchText.mockImplementation(async (args) => {
      callOrder.push(`agent:${args.agent}`);
      return origResearch(args);
    });

    await service.run("startup-1");

    expect(researchParametersService.generate).toHaveBeenCalledTimes(1);
    expect(callOrder[0]).toBe("researchParameters");
    expect(callOrder.slice(1).every((c) => c.startsWith("agent:"))).toBe(true);
  });

  it("includes researchParameters in the returned result", async () => {
    const result = await service.run("startup-1");

    expect(result.researchParameters).toEqual(mockResearchParameters);
  });

  it("emits per-agent start and completion callbacks", async () => {
    const onAgentStart = jest.fn();
    const onAgentComplete = jest.fn();

    await service.run("startup-1", { onAgentStart, onAgentComplete });

    expect(onAgentStart).toHaveBeenCalledTimes(5);
    expect(onAgentComplete).toHaveBeenCalledTimes(5);
    expect(onAgentStart).toHaveBeenCalledWith("team");
    expect(onAgentComplete).toHaveBeenCalledWith(
      expect.objectContaining({
        agent: "market",
        usedFallback: true,
      }),
    );
  });

  it("applies configured stagger across all research agents", async () => {
    const aiConfigWithStagger = {
      getModelForPurpose: jest.fn().mockReturnValue("gemini-3-flash-preview"),
      getResearchAgentStaggerMs: jest.fn().mockReturnValue(1000),
    } as unknown as jest.Mocked<AiConfigService>;

    const modelByPromptKey: Record<string, string> = {
      "research.team": "gemini-3-flash-preview",
      "research.market": "o4-mini-deep-research",
      "research.product": "gpt-5.2",
      "research.news": "o4-mini-deep-research",
      "research.competitor": "o4-mini-deep-research",
    };

    const modelExecution = {
      resolveForPrompt: jest.fn(async ({ key }: { key: string }) => ({
        resolvedConfig: {
          source: "published",
          revisionId: "rev-1",
          stage: null,
          purpose: "research",
          modelName: modelByPromptKey[key] ?? "gemini-3-flash-preview",
          provider:
            modelByPromptKey[key]?.startsWith("gemini") === true
              ? "google"
              : "openai",
          searchMode: "provider_grounded_search",
          supportedSearchModes: ["off", "provider_grounded_search"],
        },
        generateTextOptions: {
          model: undefined,
          tools: undefined,
          toolChoice: undefined,
          stopWhen: undefined,
          providerOptions: undefined,
        },
        searchEnforcement: {
          requiresProviderEvidence: false,
          requiresBraveToolCall: false,
        },
        usage: {
          getBraveToolCallCount: () => 0,
        },
      })),
    } as unknown as jest.Mocked<AiModelExecutionService>;

    service = new ResearchService(
      pipelineState,
      geminiResearch,
      pipelineFeedback,
      promptService,
      researchParametersService,
      undefined,
      aiConfigWithStagger,
      modelExecution,
    );

    const sleepSpy = jest
      .spyOn(
        service as unknown as { sleep: (ms: number) => Promise<void> },
        "sleep",
      )
      .mockResolvedValue(undefined);

    await service.run("startup-1");

    const staggerValues = sleepSpy.mock.calls
      .map(([value]) => value)
      .sort((a, b) => a - b);
    expect(staggerValues).toEqual([1000, 2000, 3000]);
  });

  it("stagger remains model-agnostic for non deep-research models", async () => {
    const aiConfigWithStagger = {
      getModelForPurpose: jest.fn().mockReturnValue("gemini-3-flash-preview"),
      getResearchAgentStaggerMs: jest.fn().mockReturnValue(1000),
    } as unknown as jest.Mocked<AiConfigService>;

    const modelExecution = {
      resolveForPrompt: jest.fn(async () => ({
        resolvedConfig: {
          source: "published",
          revisionId: "rev-1",
          stage: null,
          purpose: "research",
          modelName: "gemini-3-flash-preview",
          provider: "google",
          searchMode: "provider_grounded_search",
          supportedSearchModes: ["off", "provider_grounded_search"],
        },
        generateTextOptions: {
          model: undefined,
          tools: undefined,
          toolChoice: undefined,
          stopWhen: undefined,
          providerOptions: undefined,
        },
        searchEnforcement: {
          requiresProviderEvidence: false,
          requiresBraveToolCall: false,
        },
        usage: {
          getBraveToolCallCount: () => 0,
        },
      })),
    } as unknown as jest.Mocked<AiModelExecutionService>;

    service = new ResearchService(
      pipelineState,
      geminiResearch,
      pipelineFeedback,
      promptService,
      researchParametersService,
      undefined,
      aiConfigWithStagger,
      modelExecution,
    );

    const sleepSpy = jest
      .spyOn(
        service as unknown as { sleep: (ms: number) => Promise<void> },
        "sleep",
      )
      .mockResolvedValue(undefined);

    await service.run("startup-1");

    const staggerValues = sleepSpy.mock.calls
      .map(([value]) => value)
      .sort((a, b) => a - b);
    expect(staggerValues).toEqual([1000, 2000, 3000]);
  });
});
