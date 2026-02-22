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

  buildContext({ extraction, scraping, research }: EvaluationPipelineInput) {
    const previousFunding =
      research.news?.articles
        .filter((article) =>
          CONTENT_PATTERNS.FUNDING.test(`${article.title} ${article.summary}`),
        )
        .map((article) => ({
          title: article.title,
          date: article.date,
          source: article.source,
          url: article.url,
        })) ?? [];

    const tractionMetrics = {
      notableClaims: scraping.notableClaims
        .slice(0, 15)
        .map((claim) => this.truncate(claim, 220)),
      customerLogos: scraping.website?.customerLogos.length ?? 0,
      testimonials: scraping.website?.testimonials.length ?? 0,
      fundingAsk: extraction.fundingAsk,
    };

    const newsResearch = research.news
      ? {
          sentiment: research.news.sentiment,
          recentEvents: research.news.recentEvents
            .slice(0, 8)
            .map((event) => this.truncate(event, 220)),
          articles: research.news.articles.slice(0, 12).map((article) => ({
            title: this.truncate(article.title, 160),
            source: article.source,
            date: article.date,
            summary: this.truncate(article.summary, 320),
            url: article.url,
          })),
        }
      : null;

    return {
      tractionMetrics,
      stage: extraction.stage,
      newsResearch,
      previousFunding,
    };
  }

  fallback({ extraction }: EvaluationPipelineInput): TractionEvaluation {
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

    const stage = pipelineData.extraction.stage.toLowerCase();
    const earlyStagePattern = /\b(idea|pre[ _-]?seed|seed|pre[ _-]?series[ _-]?a)\b/;
    const isEarlyStage = earlyStagePattern.test(stage);

    const evidenceCorpus = [
      ...pipelineData.scraping.notableClaims,
      ...(pipelineData.research.news?.recentEvents ?? []),
      ...(pipelineData.research.news?.articles.map(
        (article) => `${article.title} ${article.summary}`,
      ) ?? []),
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
