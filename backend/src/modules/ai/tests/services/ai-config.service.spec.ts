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
});
