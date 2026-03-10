import { Injectable } from "@nestjs/common";
import { CONTENT_PATTERNS } from "../../constants";
import type { EvaluationPipelineInput } from "../../interfaces/agent.interface";
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

  protected override getAgentTemplateVariables(
    pipelineData: EvaluationPipelineInput,
  ): Record<string, string> {
    const claims = Array.isArray(pipelineData.scraping.notableClaims)
      ? pipelineData.scraping.notableClaims
      : [];
    return {
      deckTractionData: claims.length > 0 ? claims.join("\n") : "Not provided",
    };
  }

  buildContext(pipelineData: EvaluationPipelineInput) {
    const { extraction, scraping, research } = pipelineData;
    const notableClaims = Array.isArray(scraping.notableClaims)
      ? scraping.notableClaims
      : [];
    const customerLogos = Array.isArray(scraping.website?.customerLogos)
      ? scraping.website.customerLogos
      : [];
    const testimonials = Array.isArray(scraping.website?.testimonials)
      ? scraping.website.testimonials
      : [];
    const previousFunding = notableClaims
      .filter((claim) => CONTENT_PATTERNS.FUNDING.test(claim))
      .map((claim) => ({
        title: this.truncate(claim, 160),
        source: "Notable claim",
      }));

    const tractionMetrics = {
      notableClaims: notableClaims
        .slice(0, 15)
        .map((claim) => this.truncate(claim, 220)),
      customerLogos: customerLogos.length,
      testimonials: testimonials.length,
      fundingAsk: extraction.fundingAsk,
    };

    return {
      researchReportText: this.buildResearchReportText(pipelineData),
      tractionMetrics,
      stage: extraction.stage,
      previousFunding,
    };
  }

  fallback({ extraction: _extraction }: EvaluationPipelineInput): TractionEvaluation {
    return TractionEvaluationSchema.parse({
      ...baseEvaluation(20, "Traction data insufficient — requires manual review"),
    });
  }

  private truncate(value: string, max: number): string {
    if (value.length <= max) {
      return value;
    }
    return `${value.slice(0, max - 3)}...`;
  }
}
