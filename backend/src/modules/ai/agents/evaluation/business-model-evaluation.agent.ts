import { Injectable } from "@nestjs/common";
import type { EvaluationPipelineInput } from "../../interfaces/agent.interface";
import {
  BusinessModelEvaluationSchema,
  type BusinessModelEvaluation,
} from "../../schemas";
import { AiConfigService } from "../../services/ai-config.service";
import { AiProviderService } from "../../providers/ai-provider.service";
import { BaseEvaluationAgent } from "./base-evaluation.agent";
import { baseEvaluation, fundingScore } from "./evaluation-utils";

@Injectable()
export class BusinessModelEvaluationAgent extends BaseEvaluationAgent<BusinessModelEvaluation> {
  readonly key = "businessModel" as const;
  protected readonly schema = BusinessModelEvaluationSchema;
  protected readonly systemPrompt =
    "You are a startup investment analyst evaluating business model quality and scalability.";

  constructor(providers: AiProviderService, aiConfig: AiConfigService) {
    super(providers, aiConfig);
  }

  buildContext({ extraction, scraping }: EvaluationPipelineInput) {
    const deckBusinessModelSection = extraction.rawText || extraction.tagline;
    const pricing = scraping.website?.pricing;
    const revenueModel = pricing?.plans.length
      ? "Tiered subscription pricing with enterprise expansion"
      : "Revenue model detail is limited in current materials";
    const unitEconomics = {
      runwayMonthsEstimate: extraction.fundingAsk ? 18 : undefined,
      burnMultipleSignal: extraction.fundingAsk
        ? Number((extraction.fundingAsk / 1_000_000).toFixed(2))
        : undefined,
    };

    return {
      deckBusinessModelSection,
      pricing,
      revenueModel,
      unitEconomics,
    };
  }

  fallback({ extraction }: EvaluationPipelineInput): BusinessModelEvaluation {
    return BusinessModelEvaluationSchema.parse({
      ...baseEvaluation(37 + fundingScore(extraction.fundingAsk ?? 0) / 10, "Business model clarity is moderate"),
      revenueStreams: ["Subscription", "Service add-ons"],
      unitEconomics: "Unit economics assumptions are preliminary",
      scalability: "Model scales with increased automation and channel leverage",
      defensibility: "Defensibility is moderate and execution-dependent",
    });
  }
}
