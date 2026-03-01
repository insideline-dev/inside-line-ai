import { Injectable } from "@nestjs/common";
import { CONTENT_PATTERNS } from "../../constants";
import type {
  EvaluationAgentResult,
  EvaluationAgentRunOptions,
  EvaluationPipelineInput,
} from "../../interfaces/agent.interface";
import { TractionEvaluationSchema, type TractionEvaluation } from "../../schemas";
import { AiConfigService } from "../../services/ai-config.service";
import { AiPromptService } from "../../services/ai-prompt.service";
import { AiModelExecutionService } from "../../services/ai-model-execution.service";
import { AiProviderService } from "../../providers/ai-provider.service";
import { BaseEvaluationAgent } from "./base-evaluation.agent";
import { baseEvaluation } from "./evaluation-utils";

@Injectable()
export class TractionEvaluationAgent extends BaseEvaluationAgent<TractionEvaluation> {
  readonly key = "traction" as const;
  protected readonly schema = TractionEvaluationSchema;
  protected readonly systemPrompt =
    "You are a startup investment analyst evaluating traction, growth signals, and KPI credibility.";

  constructor(
    providers: AiProviderService,
    aiConfig: AiConfigService,
    promptService: AiPromptService,
    modelExecution?: AiModelExecutionService,
  ) {
    super(providers, aiConfig, promptService, modelExecution);
  }

  async run(
    pipelineData: EvaluationPipelineInput,
    options?: EvaluationAgentRunOptions,
  ): Promise<EvaluationAgentResult<TractionEvaluation>> {
    const result = await super.run(pipelineData, options);
    return {
      ...result,
      output: this.sanitizeTractionMetrics(result.output, pipelineData),
    };
  }

  protected override getAgentTemplateVariables(
    pipelineData: EvaluationPipelineInput,
  ): Record<string, string> {
    const claims = Array.isArray(pipelineData.scraping.notableClaims)
      ? pipelineData.scraping.notableClaims
      : [];
    return {
      deckTractionData: claims.length > 0 ? claims.join("\n") : "Not provided",
    };
  }

  buildContext(pipelineData: EvaluationPipelineInput) {
    const { extraction, scraping } = pipelineData;
    const notableClaims = Array.isArray(scraping.notableClaims)
      ? scraping.notableClaims
      : [];
    const customerLogos = Array.isArray(scraping.website?.customerLogos)
      ? scraping.website.customerLogos
      : [];
    const testimonials = Array.isArray(scraping.website?.testimonials)
      ? scraping.website.testimonials
      : [];
    const previousFunding = notableClaims
      .filter((claim) => CONTENT_PATTERNS.FUNDING.test(claim))
      .map((claim) => ({
        title: this.truncate(claim, 160),
        source: "Notable claim",
      }));

    const tractionMetrics = {
      notableClaims: notableClaims
        .slice(0, 15)
        .map((claim) => this.truncate(claim, 220)),
      customerLogos: customerLogos.length,
      testimonials: testimonials.length,
      fundingAsk: extraction.fundingAsk,
    };

    const newsResearch = null;

    return {
      researchReportText: this.buildResearchReportText(pipelineData),
      tractionMetrics,
      stage: extraction.stage,
      newsResearch,
      previousFunding,
    };
  }

  fallback({ extraction: _extraction }: EvaluationPipelineInput): TractionEvaluation {
    return TractionEvaluationSchema.parse({
      ...baseEvaluation(20, "Traction data insufficient — requires manual review"),
      metrics: {
        users: undefined,
        revenue: undefined,
        growthRatePct: undefined,
      },
      customerValidation: "Initial customer validation exists but is limited",
      growthTrajectory: "Trajectory is promising but lacks audited evidence",
      revenueModel: "Revenue model needs expanded detail",
    });
  }

  private truncate(value: string, max: number): string {
    if (value.length <= max) {
      return value;
    }
    return `${value.slice(0, max - 3)}...`;
  }

  private sanitizeTractionMetrics(
    output: TractionEvaluation,
    pipelineData: EvaluationPipelineInput,
  ): TractionEvaluation {
    const revenue = output.metrics.revenue;
    if (revenue == null) {
      return output;
    }

    const stage = typeof pipelineData.extraction.stage === "string"
      ? pipelineData.extraction.stage.toLowerCase()
      : "";
    const earlyStagePattern = /\b(idea|pre[ _-]?seed|seed|pre[ _-]?series[ _-]?a)\b/;
    const isEarlyStage = earlyStagePattern.test(stage);

    const evidenceCorpus = [
      ...(Array.isArray(pipelineData.scraping.notableClaims)
        ? pipelineData.scraping.notableClaims
        : []),
      pipelineData.research.combinedReportText ?? "",
    ]
      .join(" ")
      .toLowerCase();

    const hasVolumeSignal =
      /\b(tpv|gpv|gmv|payment volume|transaction volume|gross merchandise volume)\b/.test(
        evidenceCorpus,
      );
    const hasExplicitRevenueSignal = /\b(revenue|arr|mrr|sales)\b/.test(
      evidenceCorpus,
    );
    const looksLikeVolumeMisclassification =
      hasVolumeSignal && !hasExplicitRevenueSignal;
    const implausibleForEarlyStage = isEarlyStage && revenue >= 100_000_000;

    if (!looksLikeVolumeMisclassification && !implausibleForEarlyStage) {
      return output;
    }

    return {
      ...output,
      metrics: {
        ...output.metrics,
        revenue: undefined,
      },
    };
  }
}
