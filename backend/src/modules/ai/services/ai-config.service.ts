import { Inject, Injectable, forwardRef } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { QueueName, QUEUE_NAMES } from "../../../queue";
import { DEFAULT_MODEL_BY_PURPOSE } from "../ai.config";
import { ModelPurpose } from "../interfaces/pipeline.interface";
import { ResearchAgentKey } from "../interfaces/agent.interface";
import { AiModelOverrideService } from "./ai-model-override.service";

const DEFAULT_RESEARCH_ATTEMPT_TIMEOUT_MS = 3_600_000; // 1 hour per attempt (deep research models can take 30+ min)
const DEFAULT_RESEARCH_AGENT_HARD_TIMEOUT_MS = 3_600_000; // 1 hour hard ceiling per agent
const DEFAULT_SYNTHESIS_ATTEMPT_TIMEOUT_MS = 10_800_000; // 180 min one-big-timeout budget for synthesis
const DEFAULT_SYNTHESIS_AGENT_HARD_TIMEOUT_MS = 10_800_000; // 180 min hard ceiling aligned with synthesis attempt budget

@Injectable()
export class AiConfigService {
  constructor(
    private config: ConfigService,
    @Inject(forwardRef(() => AiModelOverrideService))
    private overrideService: AiModelOverrideService,
  ) {}

  private toPositiveInt(value: number | undefined, fallback: number): number {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return fallback;
    }

    const normalized = Math.floor(value);
    return normalized > 0 ? normalized : fallback;
  }

  isPromptRuntimeConfigEnabled(): boolean {
    return this.config.get<boolean>("AI_PROMPT_RUNTIME_CONFIG_ENABLED", false);
  }

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
    return DEFAULT_RESEARCH_ATTEMPT_TIMEOUT_MS;
  }

  getResearchAttemptTimeoutMs(): number {
    const configured = this.config.get<number>("AI_RESEARCH_ATTEMPT_TIMEOUT_MS");
    return this.toPositiveInt(configured, DEFAULT_RESEARCH_ATTEMPT_TIMEOUT_MS);
  }

  getResearchMaxAttempts(): number {
    const configured = this.config.get<number>("AI_RESEARCH_MAX_ATTEMPTS");
    return this.toPositiveInt(configured, 3);
  }

  getResearchAgentHardTimeoutMs(): number {
    const configured = this.config.get<number>("AI_RESEARCH_AGENT_HARD_TIMEOUT_MS");
    return this.toPositiveInt(configured, DEFAULT_RESEARCH_AGENT_HARD_TIMEOUT_MS);
  }

  getResearchAttemptTimeoutMsForAgent(_agent: ResearchAgentKey): number {
    return this.getResearchAttemptTimeoutMs();
  }

  getResearchAgentStaggerMs(): number {
    const configured = this.config.get<number>("AI_RESEARCH_AGENT_STAGGER_MS");
    if (typeof configured !== "number" || !Number.isFinite(configured)) {
      return 180_000; // 3 minutes between each agent start
    }

    const normalized = Math.floor(configured);
    if (normalized < 0) {
      return 180_000;
    }

    return normalized;
  }

  getEvaluationAgentStaggerMs(): number {
    const configured = this.config.get<number>("AI_EVALUATION_AGENT_STAGGER_MS");
    if (typeof configured !== "number" || !Number.isFinite(configured)) {
      return 5_000;
    }

    const normalized = Math.floor(configured);
    if (normalized < 0) {
      return 5_000;
    }

    return normalized;
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
    return this.config.get<number>("AI_EVALUATION_MAX_OUTPUT_TOKENS", 8000);
  }

  getEvaluationTimeoutMs(): number {
    return this.getEvaluationAttemptTimeoutMs();
  }

  getEvaluationAttemptTimeoutMs(): number {
    const configured = this.config.get<number>("AI_EVALUATION_ATTEMPT_TIMEOUT_MS");
    return this.toPositiveInt(configured, 600_000);
  }

  getEvaluationMaxAttempts(): number {
    const configured = this.config.get<number>("AI_EVALUATION_MAX_ATTEMPTS");
    return this.toPositiveInt(configured, 3);
  }

  getEvaluationAgentHardTimeoutMs(): number {
    const configured = this.config.get<number>("AI_EVALUATION_AGENT_HARD_TIMEOUT_MS");
    return this.toPositiveInt(configured, 2 * 60 * 60 * 1000); // 2 hours default
  }

  getSynthesisMaxOutputTokens(): number {
    return this.config.get<number>("AI_SYNTHESIS_MAX_OUTPUT_TOKENS", 120000);
  }

  getSynthesisTimeoutMs(): number {
    return this.getSynthesisAttemptTimeoutMs();
  }

  getSynthesisAttemptTimeoutMs(): number {
    const configured = this.config.get<number>("AI_SYNTHESIS_ATTEMPT_TIMEOUT_MS");
    return this.toPositiveInt(configured, DEFAULT_SYNTHESIS_ATTEMPT_TIMEOUT_MS);
  }

  getSynthesisMaxAttempts(): number {
    const configured = this.config.get<number>("AI_SYNTHESIS_MAX_ATTEMPTS");
    return this.toPositiveInt(configured, 3);
  }

  getSynthesisAgentHardTimeoutMs(): number {
    const configured = this.config.get<number>("AI_SYNTHESIS_AGENT_HARD_TIMEOUT_MS");
    return this.toPositiveInt(configured, DEFAULT_SYNTHESIS_AGENT_HARD_TIMEOUT_MS);
  }

  getDynamicAgentAttemptTimeoutMs(): number {
    const configured = this.config.get<number>("AI_DYNAMIC_AGENT_ATTEMPT_TIMEOUT_MS");
    return this.toPositiveInt(configured, 600_000); // 10 min
  }

  getModelForPurpose(purpose: ModelPurpose): string {
    const override = this.overrideService.getModelNameSync(purpose);
    if (override) return override;

    switch (purpose) {
      case ModelPurpose.EXTRACTION:
        return this.config.get<string>(
          "AI_MODEL_EXTRACTION",
          DEFAULT_MODEL_BY_PURPOSE[ModelPurpose.EXTRACTION],
        );
      case ModelPurpose.ENRICHMENT:
        return this.config.get<string>(
          "AI_MODEL_ENRICHMENT",
          DEFAULT_MODEL_BY_PURPOSE[ModelPurpose.ENRICHMENT],
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
      case ModelPurpose.MEMO_SYNTHESIS:
        return this.config.get<string>(
          "AI_MODEL_MEMO_SYNTHESIS",
          DEFAULT_MODEL_BY_PURPOSE[ModelPurpose.MEMO_SYNTHESIS],
        );
      case ModelPurpose.REPORT_SYNTHESIS:
        return this.config.get<string>(
          "AI_MODEL_REPORT_SYNTHESIS",
          DEFAULT_MODEL_BY_PURPOSE[ModelPurpose.REPORT_SYNTHESIS],
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
      case ModelPurpose.CLARA:
        return this.config.get<string>(
          "AI_MODEL_CLARA",
          DEFAULT_MODEL_BY_PURPOSE[ModelPurpose.CLARA],
        );
      case ModelPurpose.CLASSIFICATION:
        return this.config.get<string>(
          "AI_MODEL_CLASSIFICATION",
          DEFAULT_MODEL_BY_PURPOSE[ModelPurpose.CLASSIFICATION],
        );
      default:
        return DEFAULT_MODEL_BY_PURPOSE[purpose];
    }
  }

  getQueueConcurrency(queueName: QueueName): number {
    const fallback: Record<QueueName, number> = {
      [QUEUE_NAMES.TASK]: 10,
      [QUEUE_NAMES.AI_EXTRACTION]: 4,
      [QUEUE_NAMES.AI_ENRICHMENT]: 4,
      [QUEUE_NAMES.AI_SCRAPING]: 4,
      [QUEUE_NAMES.AI_RESEARCH]: 6,
      [QUEUE_NAMES.AI_EVALUATION]: 8,
      [QUEUE_NAMES.AI_SYNTHESIS]: 2,
      [QUEUE_NAMES.AI_MATCHING]: 3,
      [QUEUE_NAMES.DOCUMENT_CLASSIFICATION]: 5,
      [QUEUE_NAMES.EVOLUTION_WHATSAPP_WEBHOOK]: 5,
    };

    const envMap: Record<QueueName, string> = {
      [QUEUE_NAMES.TASK]: "QUEUE_CONCURRENCY_TASK",
      [QUEUE_NAMES.AI_EXTRACTION]: "AI_QUEUE_CONCURRENCY_EXTRACTION",
      [QUEUE_NAMES.AI_ENRICHMENT]: "AI_QUEUE_CONCURRENCY_ENRICHMENT",
      [QUEUE_NAMES.AI_SCRAPING]: "AI_QUEUE_CONCURRENCY_SCRAPING",
      [QUEUE_NAMES.AI_RESEARCH]: "AI_QUEUE_CONCURRENCY_RESEARCH",
      [QUEUE_NAMES.AI_EVALUATION]: "AI_QUEUE_CONCURRENCY_EVALUATION",
      [QUEUE_NAMES.AI_SYNTHESIS]: "AI_QUEUE_CONCURRENCY_SYNTHESIS",
      [QUEUE_NAMES.AI_MATCHING]: "AI_QUEUE_CONCURRENCY_MATCHING",
      [QUEUE_NAMES.DOCUMENT_CLASSIFICATION]: "AI_QUEUE_CONCURRENCY_CLASSIFICATION",
      [QUEUE_NAMES.EVOLUTION_WHATSAPP_WEBHOOK]: "QUEUE_CONCURRENCY_EVOLUTION_WHATSAPP_WEBHOOK",
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
    return Number(this.config.get("AI_MATCHING_MAX_OUTPUT_TOKENS", "10000"));
  }

  getMatchingMinThesisFitScore(): number {
    return Number(this.config.get("AI_MATCHING_MIN_THESIS_FIT_SCORE", "80"));
  }

  getMatchingFallbackScore(): number {
    return Number(this.config.get("AI_MATCHING_FALLBACK_SCORE", "30"));
  }

  getEnrichmentTemperature(): number {
    return Number(this.config.get("AI_ENRICHMENT_TEMPERATURE", "0.1"));
  }

  isEnrichmentEnabled(): boolean {
    return this.config.get<boolean>("AI_ENRICHMENT_ENABLED", true);
  }

  isSourceSanitizationEnabled(): boolean {
    return this.config.get<boolean>("AI_SOURCE_SANITIZATION_ENABLED", true);
  }

  getEnrichmentTimeoutMs(): number {
    return this.config.get<number>(
      "AI_ENRICHMENT_TIMEOUT_MS",
      this.getPipelineTimeoutMs(),
    );
  }

  getEnrichmentCorrectionThreshold(): number {
    return this.config.get<number>(
      "ENRICHMENT_CORRECTION_CONFIDENCE_THRESHOLD",
      0.85,
    );
  }
}
