import { Injectable } from "@nestjs/common";
import type { EvaluationPipelineInput } from "../../interfaces/agent.interface";
import {
  CompetitiveAdvantageEvaluationSchema,
  type CompetitiveAdvantageEvaluation,
} from "../../schemas";
import { AiConfigService } from "../../services/ai-config.service";
import { AiPromptService } from "../../services/ai-prompt.service";
import { AiModelExecutionService } from "../../services/ai-model-execution.service";
import { AiProviderService } from "../../providers/ai-provider.service";
import { BaseEvaluationAgent } from "./base-evaluation.agent";
import { baseEvaluation } from "./evaluation-utils";

@Injectable()
export class CompetitiveAdvantageEvaluationAgent extends BaseEvaluationAgent<CompetitiveAdvantageEvaluation> {
  readonly key = "competitiveAdvantage" as const;
  protected readonly schema = CompetitiveAdvantageEvaluationSchema;
  protected readonly systemPrompt =
    "You are a startup investment analyst evaluating defensibility and competitive moats.";

  constructor(
    providers: AiProviderService,
    aiConfig: AiConfigService,
    promptService: AiPromptService,
    modelExecution?: AiModelExecutionService,
  ) {
    super(providers, aiConfig, promptService, modelExecution);
  }

  buildContext(pipelineData: EvaluationPipelineInput) {
    const patents: string[] = [];
    return {
      researchReportText: this.buildResearchReportText(pipelineData),
      competitiveLandscape: [],
      extractedFeatures: [],
      patents,
      techStack: [],
    };
  }

  fallback({ extraction: _extraction }: EvaluationPipelineInput): CompetitiveAdvantageEvaluation {
    return CompetitiveAdvantageEvaluationSchema.parse({
      ...baseEvaluation(20, "Competitive advantage evaluation incomplete — requires manual review"),
      moats: ["Workflow integration depth", "Execution velocity"],
      competitivePosition: "Positioned as an early category challenger",
      barriers: ["Domain expertise", "Accumulating operational know-how"],
    });
  }
}
