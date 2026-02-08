import { Injectable } from "@nestjs/common";
import type { EvaluationPipelineInput } from "../../interfaces/agent.interface";
import { TractionEvaluationSchema, type TractionEvaluation } from "../../schemas";
import { AiConfigService } from "../../services/ai-config.service";
import { AiProviderService } from "../../providers/ai-provider.service";
import { BaseEvaluationAgent } from "./base-evaluation.agent";
import { baseEvaluation, stageMultiplier } from "./evaluation-utils";

@Injectable()
export class TractionEvaluationAgent extends BaseEvaluationAgent<TractionEvaluation> {
  readonly key = "traction" as const;
  protected readonly schema = TractionEvaluationSchema;
  protected readonly systemPrompt =
    "You are a startup investment analyst evaluating traction, growth signals, and KPI credibility.";

  constructor(providers: AiProviderService, aiConfig: AiConfigService) {
    super(providers, aiConfig);
  }

  buildContext({ extraction, scraping, research }: EvaluationPipelineInput) {
    const previousFunding =
      research.news?.articles
        .filter((article) =>
          /(fund|raise|series|seed|investment)/i.test(
            `${article.title} ${article.summary}`,
          ),
        )
        .map((article) => ({
          title: article.title,
          date: article.date,
          source: article.source,
          url: article.url,
        })) ?? [];

    const tractionMetrics = {
      notableClaims: scraping.notableClaims,
      customerLogos: scraping.website?.customerLogos.length ?? 0,
      testimonials: scraping.website?.testimonials.length ?? 0,
      fundingAsk: extraction.fundingAsk,
    };

    return {
      tractionMetrics,
      stage: extraction.stage,
      newsResearch: research.news,
      previousFunding,
    };
  }

  fallback({ extraction }: EvaluationPipelineInput): TractionEvaluation {
    return TractionEvaluationSchema.parse({
      ...baseEvaluation(30 + stageMultiplier(extraction.stage), "Traction evidence is moderate and needs KPI validation"),
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
}
