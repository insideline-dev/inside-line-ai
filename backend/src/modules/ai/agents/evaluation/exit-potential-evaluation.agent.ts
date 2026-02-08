import { Injectable } from "@nestjs/common";
import type { EvaluationPipelineInput } from "../../interfaces/agent.interface";
import {
  ExitPotentialEvaluationSchema,
  type ExitPotentialEvaluation,
} from "../../schemas";
import { AiConfigService } from "../../services/ai-config.service";
import { AiProviderService } from "../../providers/ai-provider.service";
import { BaseEvaluationAgent } from "./base-evaluation.agent";
import { baseEvaluation, stageMultiplier } from "./evaluation-utils";

@Injectable()
export class ExitPotentialEvaluationAgent extends BaseEvaluationAgent<ExitPotentialEvaluation> {
  readonly key = "exitPotential" as const;
  protected readonly schema = ExitPotentialEvaluationSchema;
  protected readonly systemPrompt =
    "You are a startup investment analyst evaluating long-term exit scenarios and return potential.";

  constructor(providers: AiProviderService, aiConfig: AiConfigService) {
    super(providers, aiConfig);
  }

  buildContext({ extraction, research }: EvaluationPipelineInput) {
    const competitorMandA =
      research.news?.articles
        .filter((article) =>
          /(acquire|acquired|acquisition|merger|m&a)/i.test(
            `${article.title} ${article.summary}`,
          ),
        )
        .map((article) => ({
          title: article.title,
          source: article.source,
          date: article.date,
          url: article.url,
        })) ?? [];

    const exitOpportunities =
      research.market?.marketTrends.filter((trend) =>
        /(acquisition|consolidation|ipo|public market|roll-up|m&a)/i.test(trend),
      ) ?? [];

    return {
      marketSize: research.market?.marketSize ?? {},
      competitorMandA,
      businessModelScalability:
        extraction.rawText || "Scalability signal requires deeper diligence",
      exitOpportunities,
    };
  }

  fallback({ extraction }: EvaluationPipelineInput): ExitPotentialEvaluation {
    return ExitPotentialEvaluationSchema.parse({
      ...baseEvaluation(38 + stageMultiplier(extraction.stage) / 2, "Exit potential is plausible with execution upside"),
      exitScenarios: ["Strategic acquisition", "Secondary-led growth exit"],
      acquirers: ["Category incumbent", "Platform consolidator"],
      exitTimeline: "5-8 years",
      returnPotential: "Potential venture-scale return with strong execution",
    });
  }
}
