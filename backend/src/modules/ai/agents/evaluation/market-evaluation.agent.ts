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
    const { extraction, research } = pipelineData;
    const claimedTAM = undefined;

    return {
      researchReportText: this.buildFocusedMarketResearchReport(
        research.market,
        research.competitor,
        research.product,
      ),
      industry: extraction.industry,
      claimedTAM,
      targetMarket: extraction.industry,
      competitiveLandscape: [],
    };
  }

  fallback({ extraction }: EvaluationPipelineInput): MarketEvaluation {
    return MarketEvaluationSchema.parse({
      ...baseEvaluation(25, "Market evaluation incomplete — requires manual review"),
      marketSize: "TAM/SAM/SOM require stronger external benchmarks",
      marketGrowth: "Growth trajectory appears favorable for this segment",
      tamEstimate: 0, // Unknown — do not fabricate TAM from funding ask
      marketTiming: "Timing is favorable due to sustained demand tailwinds",
      credibilityScore: clampScore(20),
    });
  }

  private buildFocusedMarketResearchReport(
    market: EvaluationPipelineInput["research"]["market"],
    competitor: EvaluationPipelineInput["research"]["competitor"],
    product: EvaluationPipelineInput["research"]["product"],
  ): string {
    const sections = [
      ["Market Research Report", this.limitSection(market, 4_000)],
      ["Competitor Research Report", this.limitSection(competitor, 2_500)],
      ["Product Research Report", this.limitSection(product, 1_800)],
    ]
      .filter(([, value]) => value.length > 0)
      .map(([label, value]) => `## ${label}\n${value}`);

    return sections.join("\n\n");
  }

  private limitSection(value: unknown, maxChars: number): string {
    const text = this.toText(value);
    if (text.length <= maxChars) {
      return text;
    }
    return `${text.slice(0, maxChars)}\n\n...[truncated]`;
  }

  private toText(value: unknown): string {
    if (typeof value === "string") {
      return value.trim();
    }
    if (value == null) {
      return "";
    }
    try {
      return JSON.stringify(value, null, 2).trim();
    } catch {
      return String(value).trim();
    }
  }
}
