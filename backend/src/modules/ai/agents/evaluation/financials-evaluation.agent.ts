import { Injectable } from "@nestjs/common";
import type { EvaluationPipelineInput } from "../../interfaces/agent.interface";
import {
  FinancialsEvaluationSchema,
  type FinancialsEvaluation,
} from "../../schemas";
import { AiConfigService } from "../../services/ai-config.service";
import { AiProviderService } from "../../providers/ai-provider.service";
import { BaseEvaluationAgent } from "./base-evaluation.agent";
import { baseEvaluation, fundingScore } from "./evaluation-utils";

@Injectable()
export class FinancialsEvaluationAgent extends BaseEvaluationAgent<FinancialsEvaluation> {
  readonly key = "financials" as const;
  protected readonly schema = FinancialsEvaluationSchema;
  protected readonly systemPrompt =
    "You are a startup investment analyst evaluating financial health, burn, and runway assumptions.";

  constructor(providers: AiProviderService, aiConfig: AiConfigService) {
    super(providers, aiConfig);
  }

  buildContext({ extraction, research }: EvaluationPipelineInput) {
    const fundingTarget = extraction.fundingAsk;
    const currentValuation = extraction.valuation;
    const burnRate = fundingTarget ? Math.max(0, fundingTarget / 18) : undefined;
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
        })) ?? [];

    const financialProjections = {
      runwayMonths: burnRate ? Math.max(1, Math.round((fundingTarget ?? 0) / burnRate)) : 0,
      valuation: currentValuation,
      fundingTarget,
    };

    return {
      financialProjections,
      fundingTarget,
      previousFunding,
      currentValuation,
      burnRate,
    };
  }

  fallback({ extraction }: EvaluationPipelineInput): FinancialsEvaluation {
    const ask = extraction.fundingAsk ?? 0;

    return FinancialsEvaluationSchema.parse({
      ...baseEvaluation(50 + fundingScore(ask), "Financial assumptions are directionally plausible"),
      burnRate: Math.max(0, ask / 18),
      runway: 18,
      fundingHistory: [],
      financialHealth: "Financial health is acceptable at current stage",
    });
  }
}
