import { beforeEach, describe, expect, it, jest } from "bun:test";
import { ConfigService } from "@nestjs/config";
import { QUEUE_NAMES } from "../../../../queue";
import { ModelPurpose } from "../../interfaces/pipeline.interface";
import { AiConfigService } from "../../services/ai-config.service";

describe("AiConfigService", () => {
  let config: jest.Mocked<ConfigService>;
  let service: AiConfigService;

  beforeEach(() => {
    config = {
      get: jest.fn(),
    } as unknown as jest.Mocked<ConfigService>;

    service = new AiConfigService(config);
  });

  it("returns defaults for model mapping", () => {
    config.get.mockImplementation(
      (_: string, fallback?: unknown) => fallback as string,
    );

    expect(service.getModelForPurpose(ModelPurpose.EXTRACTION)).toBe(
      "gemini-3-flash-preview",
    );
    expect(service.getModelForPurpose(ModelPurpose.ENRICHMENT)).toBe(
      "gemini-3-flash-preview",
    );
    expect(service.getModelForPurpose(ModelPurpose.SYNTHESIS)).toBe(
      "gemini-3-flash-preview",
    );
    expect(service.getModelForPurpose(ModelPurpose.OCR)).toBe(
      "mistral-ocr-latest",
    );
  });

  it("reads queue concurrency values", () => {
    config.get.mockImplementation((key: string, fallback?: unknown) => {
      if (key === "AI_QUEUE_CONCURRENCY_EVALUATION") return 12;
      return fallback as number;
    });

    expect(service.getQueueConcurrency(QUEUE_NAMES.AI_EVALUATION)).toBe(12);
    expect(service.getQueueConcurrency(QUEUE_NAMES.AI_SYNTHESIS)).toBe(2);
    expect(service.getQueueConcurrency(QUEUE_NAMES.AI_MATCHING)).toBe(3);
  });

  it("supports legacy phase concurrency env keys", () => {
    config.get.mockImplementation((key: string, fallback?: unknown) => {
      if (key === "AI_QUEUE_CONCURRENCY_EVALUATION") return undefined;
      if (key === "AI_EVALUATION_CONCURRENCY") return 11;
      return fallback as number;
    });

    expect(service.getQueueConcurrency(QUEUE_NAMES.AI_EVALUATION)).toBe(11);
  });

  it("enables pipeline by default", () => {
    config.get.mockImplementation(
      (_: string, fallback?: unknown) => fallback as boolean,
    );

    expect(service.isPipelineEnabled()).toBe(true);
  });

  it("disables enrichment by default while feature is paused", () => {
    config.get.mockImplementation(
      (_: string, fallback?: unknown) => fallback as boolean,
    );

    expect(service.isEnrichmentEnabled()).toBe(false);
  });

  it("enables source sanitization by default", () => {
    config.get.mockImplementation(
      (_: string, fallback?: unknown) => fallback as boolean,
    );

    expect(service.isSourceSanitizationEnabled()).toBe(true);
  });

  it("returns timeout and retry defaults", () => {
    config.get.mockImplementation(
      (_: string, fallback?: unknown) => fallback as number,
    );

    expect(service.getPipelineTimeoutMs()).toBe(600000);
    expect(service.getMaxRetries()).toBe(3);
  });

  it("returns evaluation generation defaults", () => {
    config.get.mockImplementation(
      (_: string, fallback?: unknown) => fallback as number,
    );

    expect(service.getEvaluationTemperature()).toBe(0.1);
    expect(service.getEvaluationMaxOutputTokens()).toBe(8000);
  });

  it("returns deep-research stagger default when unset", () => {
    config.get.mockReturnValue(undefined);

    expect(service.getResearchAgentStaggerMs()).toBe(5000);
  });

  it("uses configured deep-research stagger and allows zero to disable", () => {
    config.get.mockImplementation((key: string) => {
      if (key === "AI_RESEARCH_AGENT_STAGGER_MS") {
        return 0;
      }
      return undefined;
    });
    expect(service.getResearchAgentStaggerMs()).toBe(0);

    config.get.mockImplementation((key: string) => {
      if (key === "AI_RESEARCH_AGENT_STAGGER_MS") {
        return 120000;
      }
      return undefined;
    });
    expect(service.getResearchAgentStaggerMs()).toBe(120000);
  });

  it("returns evaluation agent stagger default when unset", () => {
    config.get.mockReturnValue(undefined);

    expect(service.getEvaluationAgentStaggerMs()).toBe(5000);
  });

  it("uses configured evaluation agent stagger and allows zero to disable", () => {
    config.get.mockImplementation((key: string) => {
      if (key === "AI_EVALUATION_AGENT_STAGGER_MS") {
        return 0;
      }
      return undefined;
    });
    expect(service.getEvaluationAgentStaggerMs()).toBe(0);

    config.get.mockImplementation((key: string) => {
      if (key === "AI_EVALUATION_AGENT_STAGGER_MS") {
        return 15000;
      }
      return undefined;
    });
    expect(service.getEvaluationAgentStaggerMs()).toBe(15000);
  });

  it("uses one-hour default research attempt timeout when unset", () => {
    config.get.mockImplementation((key: string, fallback?: unknown) => {
      if (key === "AI_RESEARCH_ATTEMPT_TIMEOUT_MS") {
        return undefined;
      }
      if (key === "AI_RESEARCH_TIMEOUT_MS") {
        return fallback as number;
      }
      return undefined;
    });

    expect(service.getResearchAttemptTimeoutMs()).toBe(3_600_000);
  });

  it("enforces at least one-hour research hard-timeout fallback", () => {
    config.get.mockImplementation((key: string, fallback?: unknown) => {
      if (key === "AI_RESEARCH_AGENT_HARD_TIMEOUT_MS") {
        return 0;
      }
      if (key === "AI_RESEARCH_ATTEMPT_TIMEOUT_MS") {
        return undefined;
      }
      if (key === "AI_RESEARCH_TIMEOUT_MS") {
        return fallback as number;
      }
      if (key === "AI_RESEARCH_MAX_ATTEMPTS") {
        return 0;
      }
      return undefined;
    });

    expect(service.getResearchAgentHardTimeoutMs()).toBe(3_600_000);
  });

  describe("getResearchAttemptTimeoutMsForAgent", () => {
    it("returns the global 1-hour research attempt timeout for competitor agent", () => {
      config.get.mockImplementation((_: string, fallback?: unknown) => fallback as number);

      expect(service.getResearchAttemptTimeoutMsForAgent("competitor")).toBe(3_600_000);
    });

    it("returns the standard research attempt timeout for all agents including competitor", () => {
      config.get.mockImplementation((_: string, fallback?: unknown) => fallback as number);

      const standard = service.getResearchAttemptTimeoutMs();

      expect(service.getResearchAttemptTimeoutMsForAgent("team")).toBe(standard);
      expect(service.getResearchAttemptTimeoutMsForAgent("market")).toBe(standard);
      expect(service.getResearchAttemptTimeoutMsForAgent("product")).toBe(standard);
      expect(service.getResearchAttemptTimeoutMsForAgent("news")).toBe(standard);
      expect(service.getResearchAttemptTimeoutMsForAgent("competitor")).toBe(standard);
    });
  });
});
