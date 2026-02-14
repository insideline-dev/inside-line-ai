import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { QueueName, QUEUE_NAMES } from "../../../queue";
import { DEFAULT_MODEL_BY_PURPOSE } from "../ai.config";
import { ModelPurpose } from "../interfaces/pipeline.interface";

@Injectable()
export class AiConfigService {
  constructor(private config: ConfigService) {}

  isPipelineEnabled(): boolean {
    return this.config.get<boolean>("AI_PIPELINE_ENABLED", true);
  }

  getPipelineStateTtlSeconds(): number {
    return this.config.get<number>("AI_PIPELINE_TTL_SECONDS", 86400);
  }

  getPipelineTimeoutMs(): number {
    return this.config.get<number>("AI_PIPELINE_TIMEOUT", 600000);
  }

  getResearchTimeoutMs(): number {
    return this.config.get<number>(
      "AI_RESEARCH_TIMEOUT_MS",
      this.getPipelineTimeoutMs(),
    );
  }

  getMaxRetries(): number {
    return this.config.get<number>("AI_MAX_RETRIES", 3);
  }

  getResearchTemperature(): number {
    return this.config.get<number>("AI_RESEARCH_TEMPERATURE", 0.4);
  }

  getSynthesisTemperature(): number {
    return this.config.get<number>("AI_SYNTHESIS_TEMPERATURE", 0.3);
  }

  getEvaluationTemperature(): number {
    return this.config.get<number>("AI_EVALUATION_TEMPERATURE", 0.1);
  }

  getEvaluationMaxOutputTokens(): number {
    return this.config.get<number>("AI_EVALUATION_MAX_OUTPUT_TOKENS", 4000);
  }

  getSynthesisMaxOutputTokens(): number {
    return this.config.get<number>("AI_SYNTHESIS_MAX_OUTPUT_TOKENS", 4000);
  }

  getModelForPurpose(purpose: ModelPurpose): string {
    switch (purpose) {
      case ModelPurpose.EXTRACTION:
        return this.config.get<string>(
          "AI_MODEL_EXTRACTION",
          DEFAULT_MODEL_BY_PURPOSE[ModelPurpose.EXTRACTION],
        );
      case ModelPurpose.RESEARCH:
        return this.config.get<string>(
          "AI_MODEL_RESEARCH",
          DEFAULT_MODEL_BY_PURPOSE[ModelPurpose.RESEARCH],
        );
      case ModelPurpose.EVALUATION:
        return this.config.get<string>(
          "AI_MODEL_EVALUATION",
          DEFAULT_MODEL_BY_PURPOSE[ModelPurpose.EVALUATION],
        );
      case ModelPurpose.SYNTHESIS:
        return this.config.get<string>(
          "AI_MODEL_SYNTHESIS",
          DEFAULT_MODEL_BY_PURPOSE[ModelPurpose.SYNTHESIS],
        );
      case ModelPurpose.THESIS_ALIGNMENT:
        return this.config.get<string>(
          "AI_MODEL_THESIS_ALIGNMENT",
          DEFAULT_MODEL_BY_PURPOSE[ModelPurpose.THESIS_ALIGNMENT],
        );
      case ModelPurpose.LOCATION_NORMALIZATION:
        return this.config.get<string>(
          "AI_MODEL_LOCATION_NORMALIZATION",
          DEFAULT_MODEL_BY_PURPOSE[ModelPurpose.LOCATION_NORMALIZATION],
        );
      case ModelPurpose.OCR:
        return this.config.get<string>(
          "AI_MODEL_OCR",
          DEFAULT_MODEL_BY_PURPOSE[ModelPurpose.OCR],
        );
      default:
        return DEFAULT_MODEL_BY_PURPOSE[purpose];
    }
  }

  getQueueConcurrency(queueName: QueueName): number {
    const fallback: Record<QueueName, number> = {
      [QUEUE_NAMES.TASK]: 10,
      [QUEUE_NAMES.AI_EXTRACTION]: 4,
      [QUEUE_NAMES.AI_SCRAPING]: 4,
      [QUEUE_NAMES.AI_RESEARCH]: 6,
      [QUEUE_NAMES.AI_EVALUATION]: 8,
      [QUEUE_NAMES.AI_SYNTHESIS]: 2,
    };

    const envMap: Record<QueueName, string> = {
      [QUEUE_NAMES.TASK]: "QUEUE_CONCURRENCY_TASK",
      [QUEUE_NAMES.AI_EXTRACTION]: "AI_QUEUE_CONCURRENCY_EXTRACTION",
      [QUEUE_NAMES.AI_SCRAPING]: "AI_QUEUE_CONCURRENCY_SCRAPING",
      [QUEUE_NAMES.AI_RESEARCH]: "AI_QUEUE_CONCURRENCY_RESEARCH",
      [QUEUE_NAMES.AI_EVALUATION]: "AI_QUEUE_CONCURRENCY_EVALUATION",
      [QUEUE_NAMES.AI_SYNTHESIS]: "AI_QUEUE_CONCURRENCY_SYNTHESIS",
    };
    const legacyEnvMap: Partial<Record<QueueName, string>> = {
      [QUEUE_NAMES.AI_EXTRACTION]: "AI_EXTRACTION_CONCURRENCY",
      [QUEUE_NAMES.AI_RESEARCH]: "AI_RESEARCH_CONCURRENCY",
      [QUEUE_NAMES.AI_EVALUATION]: "AI_EVALUATION_CONCURRENCY",
    };

    const primary = this.config.get<number>(envMap[queueName]);
    if (typeof primary === "number") {
      return primary;
    }

    const legacyKey = legacyEnvMap[queueName];
    if (legacyKey) {
      const legacy = this.config.get<number>(legacyKey);
      if (typeof legacy === "number") {
        return legacy;
      }
    }

    return fallback[queueName];
  }

  getExtractionTemperature(): number {
    return Number(this.config.get("AI_EXTRACTION_TEMPERATURE", "0.1"));
  }

  getExtractionMaxInputLength(): number {
    return Number(this.config.get("AI_EXTRACTION_MAX_INPUT_LENGTH", "80000"));
  }

  getMatchingTemperature(): number {
    return Number(this.config.get("AI_MATCHING_TEMPERATURE", "0.2"));
  }

  getMatchingMaxOutputTokens(): number {
    return Number(this.config.get("AI_MATCHING_MAX_OUTPUT_TOKENS", "500"));
  }

  getMatchingMinThesisFitScore(): number {
    return Number(this.config.get("AI_MATCHING_MIN_THESIS_FIT_SCORE", "80"));
  }

  getMatchingFallbackScore(): number {
    return Number(this.config.get("AI_MATCHING_FALLBACK_SCORE", "30"));
  }
}
