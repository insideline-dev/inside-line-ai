import { Injectable } from "@nestjs/common";
import type { EvaluationPipelineInput } from "../../interfaces/agent.interface";
import {
  ExitPotentialEvaluationSchema,
  type ExitPotentialEvaluation,
} from "../../schemas";
import { AiConfigService } from "../../services/ai-config.service";
import { AiPromptService } from "../../services/ai-prompt.service";
import { AiModelExecutionService } from "../../services/ai-model-execution.service";
import { AiProviderService } from "../../providers/ai-provider.service";
import { BaseEvaluationAgent } from "./base-evaluation.agent";
import { baseEvaluation } from "./evaluation-utils";

@Injectable()
export class ExitPotentialEvaluationAgent extends BaseEvaluationAgent<ExitPotentialEvaluation> {
  readonly key = "exitPotential" as const;
  protected readonly schema = ExitPotentialEvaluationSchema;
  protected readonly systemPrompt =
    "You are a startup investment analyst evaluating long-term exit scenarios and return potential.";

  private static readonly STAGE_DILUTION_ASSUMPTIONS: Record<string, number> = {
    pre_seed: 0.2,
    seed: 0.15,
    series_a: 0.12,
    series_b: 0.1,
    series_c: 0.08,
    series_d: 0.06,
    series_e: 0.05,
    series_f_plus: 0.05,
  };

  constructor(
    providers: AiProviderService,
    aiConfig: AiConfigService,
    promptService: AiPromptService,
    modelExecution?: AiModelExecutionService,
  ) {
    super(providers, aiConfig, promptService, modelExecution);
  }

  protected override getAgentTemplateVariables(
    _pipelineData: EvaluationPipelineInput,
  ): Record<string, string> {
    const valuationContext = this.buildEntryValuationContext(_pipelineData);
    return {
      marketResearchOutput:
        this.truncatePromptText(
          this.normalizePromptText(_pipelineData.research.market),
          5_000,
        ) || "Not provided",
      competitorResearchOutput:
        this.truncatePromptText(
          this.normalizePromptText(_pipelineData.research.competitor),
          5_000,
        ) || "Not provided",
      newsResearchOutput:
        this.truncatePromptText(
          this.normalizePromptText(_pipelineData.research.news),
          5_000,
        ) || "Not provided",
      valuation: valuationContext.valuation,
      valuationType: valuationContext.valuationType,
      roundSize: _pipelineData.extraction.fundingAsk?.toString() ?? "Not provided",
      roundCurrency: _pipelineData.extraction.startupContext?.roundCurrency ?? "USD",
    };
  }

  buildContext(pipelineData: EvaluationPipelineInput) {
    const { extraction } = pipelineData;
    const competitorMandA: Array<Record<string, unknown>> = [];
    const exitOpportunities: string[] = [];
    return {
      researchReportText: this.buildResearchReportText(pipelineData),
      marketSize: {},
      competitorMandA,
      businessModelScalability:
        extraction.rawText || "Scalability signal requires deeper diligence",
      exitOpportunities,
    };
  }

  fallback({ extraction: _extraction }: EvaluationPipelineInput): ExitPotentialEvaluation {
    return ExitPotentialEvaluationSchema.parse({
      ...baseEvaluation(20, "Exit potential evaluation incomplete — requires manual review"),
      exitScenarios: [],
    });
  }

  protected override getEvaluationAttemptTimeoutMs(): number {
    return 300_000; // 5 minutes per attempt (3 research inputs + complex schema)
  }

  protected override getEvaluationAgentHardTimeoutMs(): number {
    return 900_000; // 15 minutes hard limit for entire agent
  }

  private buildEntryValuationContext(
    pipelineData: EvaluationPipelineInput,
  ): { valuation: string; valuationType: string } {
    const explicitValuation = pipelineData.extraction.valuation;
    if (typeof explicitValuation === "number" && Number.isFinite(explicitValuation)) {
      return {
        valuation: explicitValuation.toString(),
        valuationType: pipelineData.extraction.startupContext?.valuationType ?? "Not provided",
      };
    }

    const roundSize = pipelineData.extraction.fundingAsk;
    if (typeof roundSize !== "number" || !Number.isFinite(roundSize) || roundSize <= 0) {
      return {
        valuation: "Not provided",
        valuationType: "Not provided",
      };
    }

    const stageKey = pipelineData.extraction.stage?.toLowerCase() ?? "";
    const assumedDilution =
      ExitPotentialEvaluationAgent.STAGE_DILUTION_ASSUMPTIONS[stageKey] ?? 0.15;
    const impliedPostMoney = Math.round(roundSize / assumedDilution);

    return {
      valuation: impliedPostMoney.toString(),
      valuationType: `provisional post_money assumption from round size using ${(assumedDilution * 100).toFixed(0)}% typical ${stageKey || "venture"} dilution; directional only`,
    };
  }
}
