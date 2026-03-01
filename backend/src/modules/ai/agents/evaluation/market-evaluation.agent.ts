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

  protected override getAgentTemplateVariables(
    pipelineData: EvaluationPipelineInput,
  ): Record<string, string> {
    const rawText = pipelineData.extraction.rawText ?? "";
    const marketText = pipelineData.research.market;
    const marketData = this.tryParseResearchJson(marketText);
    const marketSize =
      marketData?.marketSize && typeof marketData.marketSize === "object"
        ? (marketData.marketSize as Record<string, unknown>)
        : null;
    const tamObj =
      marketData?.totalAddressableMarket &&
      typeof marketData.totalAddressableMarket === "object"
        ? (marketData.totalAddressableMarket as Record<string, unknown>)
        : null;
    const growthObj =
      marketData?.marketGrowthRate &&
      typeof marketData.marketGrowthRate === "object"
        ? (marketData.marketGrowthRate as Record<string, unknown>)
        : null;

    // Try extracting a claim line, return null if not found (instead of "Not provided")
    const tryExtract = (text: string, pattern: RegExp): string | null => {
      const result = this.extractClaimLine(text, pattern);
      return result !== "Not provided" ? result : null;
    };

    const tamPattern = /(tam|total addressable market|market size)/i;
    const samPattern = /(sam|serviceable addressable market|serviceable available market)/i;
    const growthPattern = /(cagr|growth rate|year[- ]over[- ]year|yoy|market growth)/i;

    // Fallback chain: structured JSON → market research text → pitch deck rawText
    const claimedTAM =
      (tamObj?.value != null ? String(tamObj.value) : null) ??
      (marketSize?.tam != null ? String(marketSize.tam) : null) ??
      tryExtract(marketText ?? "", tamPattern) ??
      this.extractClaimLine(rawText, tamPattern);

    const claimedSAM =
      (marketSize?.sam != null ? String(marketSize.sam) : null) ??
      tryExtract(marketText ?? "", samPattern) ??
      this.extractClaimLine(rawText, samPattern);

    const claimedGrowthRate =
      (growthObj?.value != null ? String(growthObj.value) : null) ??
      tryExtract(marketText ?? "", growthPattern) ??
      this.extractClaimLine(rawText, growthPattern);

    return {
      marketResearchOutput: pipelineData.research.market ?? "Not provided",
      claimedTAM,
      claimedSAM,
      claimedGrowthRate,
      targetMarketDescription: pipelineData.extraction.industry || "Not provided",
    };
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
