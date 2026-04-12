import { Injectable } from "@nestjs/common";
import type { EvaluationPipelineInput } from "../../interfaces/agent.interface";
import {
  BusinessModelEvaluationSchema,
  type BusinessModelEvaluation,
} from "../../schemas";
import { AiConfigService } from "../../services/ai-config.service";
import { AiPromptService } from "../../services/ai-prompt.service";
import { AiModelExecutionService } from "../../services/ai-model-execution.service";
import { AiProviderService } from "../../providers/ai-provider.service";
import { BaseEvaluationAgent } from "./base-evaluation.agent";
import { baseEvaluation } from "./evaluation-utils";
import { OpenAiDirectClientService } from "../../services/openai-direct-client.service";
import { BusinessModelEvaluationOpenAiSchema } from "../../schemas/evaluations/openai/business-model-openai.schema";

@Injectable()
export class BusinessModelEvaluationAgent extends BaseEvaluationAgent<BusinessModelEvaluation> {
  readonly key = "businessModel" as const;
  protected readonly schema = BusinessModelEvaluationSchema;
  protected readonly systemPrompt =
    "You are a startup investment analyst evaluating business model quality and scalability.";

  protected readonly openAiSchema = BusinessModelEvaluationOpenAiSchema;

  constructor(
    providers: AiProviderService,
    aiConfig: AiConfigService,
    promptService: AiPromptService,
    modelExecution?: AiModelExecutionService,
    openAiDirect?: OpenAiDirectClientService,
  ) {
    super(providers, aiConfig, promptService, modelExecution, openAiDirect);
  }

  buildContext(pipelineData: EvaluationPipelineInput) {
    const { extraction, scraping } = pipelineData;
    const deckBusinessModelSection = extraction.rawText || extraction.tagline;
    const pricing = scraping.website?.pricing;
    const pricingPlans = Array.isArray(pricing?.plans) ? pricing.plans : [];
    const revenueModel = pricingPlans.length
      ? "Tiered subscription pricing with enterprise expansion"
      : "Revenue model detail is limited in current materials";
    const unitEconomics = {
      runwayMonthsEstimate: extraction.fundingAsk ? 18 : undefined,
      burnMultipleSignal: extraction.fundingAsk
        ? Number((extraction.fundingAsk / 1_000_000).toFixed(2))
        : undefined,
    };

    const marketContext = undefined;
    const productContext = undefined;
    const competitorContext = undefined;

    return {
      researchReportText: this.buildResearchReportText(pipelineData),
      deckBusinessModelSection,
      pricing,
      revenueModel,
      unitEconomics,
      marketContext,
      productContext,
      competitorContext,
    };
  }

  fallback({ extraction: _extraction }: EvaluationPipelineInput): BusinessModelEvaluation {
    return BusinessModelEvaluationSchema.parse({
      ...baseEvaluation(22, "Business model evaluation incomplete — requires manual review"),
      founderPitchRecommendations: [],
    });
  }
}
