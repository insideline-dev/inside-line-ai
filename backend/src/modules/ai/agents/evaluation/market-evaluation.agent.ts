import { Injectable } from "@nestjs/common";
import type { EvaluationPipelineInput } from "../../interfaces/agent.interface";
import { MarketEvaluationSchema, type MarketEvaluation } from "../../schemas";
import { AiConfigService } from "../../services/ai-config.service";
import { AiPromptService } from "../../services/ai-prompt.service";
import { AiModelExecutionService } from "../../services/ai-model-execution.service";
import { AiProviderService } from "../../providers/ai-provider.service";
import { BaseEvaluationAgent } from "./base-evaluation.agent";
import { baseEvaluation, clampScore } from "./evaluation-utils";

@Injectable()
export class MarketEvaluationAgent extends BaseEvaluationAgent<MarketEvaluation> {
  readonly key = "market" as const;
  protected readonly schema = MarketEvaluationSchema;
  protected readonly systemPrompt =
    "You are a startup investment analyst evaluating market quality and TAM credibility.";

  constructor(
    providers: AiProviderService,
    aiConfig: AiConfigService,
    promptService: AiPromptService,
    modelExecution?: AiModelExecutionService,
  ) {
    super(providers, aiConfig, promptService, modelExecution);
  }

  buildContext(pipelineData: EvaluationPipelineInput) {
    const { extraction } = pipelineData;
    const claimedTAM = undefined;

    return {
      researchReportText: this.buildResearchReportText(pipelineData),
      industry: extraction.industry,
      claimedTAM,
      targetMarket: extraction.industry,
      competitiveLandscape: [],
    };
  }

  fallback({ extraction: _extraction }: EvaluationPipelineInput): MarketEvaluation {
    return MarketEvaluationSchema.parse({
      ...baseEvaluation(25, "Market evaluation incomplete — requires manual review"),
      marketSize: "TAM/SAM/SOM require stronger external benchmarks",
      marketGrowth: "Growth trajectory appears favorable for this segment",
      tamEstimate: 0, // Unknown — do not fabricate TAM from funding ask
      marketTiming: "Timing is favorable due to sustained demand tailwinds",
      credibilityScore: clampScore(20),
    });
  }
}
