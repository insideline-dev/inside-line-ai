import { Injectable } from "@nestjs/common";
import type { EvaluationPipelineInput } from "../../interfaces/agent.interface";
import {
  BusinessModelEvaluationSchema,
  type BusinessModelEvaluation,
} from "../../schemas";
import { AiConfigService } from "../../services/ai-config.service";
import { AiPromptService } from "../../services/ai-prompt.service";
import { AiProviderService } from "../../providers/ai-provider.service";
import { BaseEvaluationAgent } from "./base-evaluation.agent";
import { baseEvaluation } from "./evaluation-utils";

@Injectable()
export class BusinessModelEvaluationAgent extends BaseEvaluationAgent<BusinessModelEvaluation> {
  readonly key = "businessModel" as const;
  protected readonly schema = BusinessModelEvaluationSchema;
  protected readonly systemPrompt =
    "You are a startup investment analyst evaluating business model quality and scalability.";

  constructor(providers: AiProviderService, aiConfig: AiConfigService, promptService: AiPromptService) {
    super(providers, aiConfig, promptService);
  }

  buildContext({ extraction, scraping, research }: EvaluationPipelineInput) {
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

    const marketContext = research.market
      ? {
          competitors: research.market.competitors.map((c) => ({
            name: c.name,
            description: c.description,
          })),
          marketTrends: research.market.marketTrends,
        }
      : undefined;

    const productContext = research.product
      ? {
          features: research.product.features,
          integrations: research.product.integrations,
        }
      : undefined;

    const competitorContext = research.competitor
      ? {
          competitorPricing: research.competitor.competitors
            .filter((c) => c.pricing)
            .map((c) => ({ name: c.name, pricing: c.pricing })),
          competitorModels: research.competitor.competitors.map((c) => ({
            name: c.name,
            productOverview: c.productOverview,
          })),
        }
      : undefined;

    return {
      deckBusinessModelSection,
      pricing,
      revenueModel,
      unitEconomics,
      marketContext,
      productContext,
      competitorContext,
    };
  }

  fallback({ extraction }: EvaluationPipelineInput): BusinessModelEvaluation {
    return BusinessModelEvaluationSchema.parse({
      ...baseEvaluation(22, "Business model evaluation incomplete — requires manual review"),
      revenueStreams: ["Subscription", "Service add-ons"],
      unitEconomics: "Unit economics assumptions are preliminary",
      scalability: "Model scales with increased automation and channel leverage",
      defensibility: "Defensibility is moderate and execution-dependent",
    });
  }
}
