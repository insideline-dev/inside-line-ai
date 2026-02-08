import { Injectable } from "@nestjs/common";
import type { EvaluationPipelineInput } from "../../interfaces/agent.interface";
import { MarketEvaluationSchema, type MarketEvaluation } from "../../schemas";
import { AiConfigService } from "../../services/ai-config.service";
import { AiProviderService } from "../../providers/ai-provider.service";
import { BaseEvaluationAgent } from "./base-evaluation.agent";
import { baseEvaluation, clampScore, stageMultiplier } from "./evaluation-utils";

@Injectable()
export class MarketEvaluationAgent extends BaseEvaluationAgent<MarketEvaluation> {
  readonly key = "market" as const;
  protected readonly schema = MarketEvaluationSchema;
  protected readonly systemPrompt =
    "You are a startup investment analyst evaluating market quality and TAM credibility.";

  constructor(providers: AiProviderService, aiConfig: AiConfigService) {
    super(providers, aiConfig);
  }

  buildContext({ extraction, research }: EvaluationPipelineInput) {
    const claimedTAM = research.market?.marketSize.tam;

    return {
      marketResearch: research.market,
      industry: extraction.industry,
      claimedTAM,
      targetMarket: extraction.industry,
      competitiveLandscape: research.market?.competitors ?? [],
    };
  }

  fallback({ extraction }: EvaluationPipelineInput): MarketEvaluation {
    const stageBoost = stageMultiplier(extraction.stage);

    return MarketEvaluationSchema.parse({
      ...baseEvaluation(40 + stageBoost, "Market appears plausible but needs third-party validation"),
      marketSize: "TAM/SAM/SOM require stronger external benchmarks",
      marketGrowth: "Growth trajectory appears favorable for this segment",
      tamEstimate: 0, // Unknown — do not fabricate TAM from funding ask
      marketTiming: "Timing is favorable due to sustained demand tailwinds",
      credibilityScore: clampScore(35 + stageBoost),
    });
  }
}
