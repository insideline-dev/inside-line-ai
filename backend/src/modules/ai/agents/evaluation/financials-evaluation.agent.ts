import { Injectable } from "@nestjs/common";
import { CONTENT_PATTERNS } from "../../constants";
import type { EvaluationPipelineInput } from "../../interfaces/agent.interface";
import {
  FinancialsEvaluationSchema,
  type FinancialsEvaluation,
} from "../../schemas";
import { AiConfigService } from "../../services/ai-config.service";
import { AiPromptService } from "../../services/ai-prompt.service";
import { AiModelExecutionService } from "../../services/ai-model-execution.service";
import { AiProviderService } from "../../providers/ai-provider.service";
import { BaseEvaluationAgent } from "./base-evaluation.agent";
import { baseEvaluation } from "./evaluation-utils";

@Injectable()
export class FinancialsEvaluationAgent extends BaseEvaluationAgent<FinancialsEvaluation> {
  readonly key = "financials" as const;
  protected readonly schema = FinancialsEvaluationSchema;
  protected readonly systemPrompt =
    "You are a startup investment analyst evaluating financial health, burn, and runway assumptions.";

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
    const fundingTarget = extraction.fundingAsk;
    const currentValuation = extraction.valuation;
    const burnRate = fundingTarget ? Math.max(0, fundingTarget / 18) : undefined;
    const notableClaims = Array.isArray(pipelineData.scraping.notableClaims)
      ? pipelineData.scraping.notableClaims
      : [];
    const previousFunding = notableClaims
      .filter((claim) => CONTENT_PATTERNS.FUNDING.test(claim))
      .map((claim) => ({
        title: claim,
        source: "Notable claim",
      }));

    const financialProjections = {
      runwayMonths: burnRate ? Math.max(1, Math.round((fundingTarget ?? 0) / burnRate)) : 0,
      valuation: currentValuation,
      fundingTarget,
    };

    return {
      researchReportText: this.buildResearchReportText(pipelineData),
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
      ...baseEvaluation(20, "Financial evaluation incomplete — requires manual review"),
      burnRate: Math.max(0, ask / 18),
      runway: 18,
      fundingHistory: [],
      financialHealth: "Financial health is acceptable at current stage",
    });
  }
}
