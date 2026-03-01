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
    return {
      marketResearchOutput: _pipelineData.research.market ?? "Not provided",
      competitorResearchOutput: _pipelineData.research.competitor ?? "Not provided",
      newsResearchOutput: _pipelineData.research.news ?? "Not provided",
      valuation: _pipelineData.extraction.valuation?.toString() ?? "Not provided",
      valuationType: _pipelineData.extraction.startupContext?.valuationType ?? "Not provided",
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
      exitScenarios: ["Strategic acquisition", "Secondary-led growth exit"],
      acquirers: ["Category incumbent", "Platform consolidator"],
      exitTimeline: "5-8 years",
      returnPotential: "Potential venture-scale return with strong execution",
    });
  }
}
