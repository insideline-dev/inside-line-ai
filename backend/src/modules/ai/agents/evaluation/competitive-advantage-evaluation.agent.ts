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

  protected override getAgentTemplateVariables(
    _pipelineData: EvaluationPipelineInput,
  ): Record<string, string> {
    const competitorText = _pipelineData.research.competitor;
    const competitorData = this.tryParseResearchJson(competitorText);

    let featureMatrix = "Not provided";
    if (competitorData) {
      const competitors = Array.isArray(competitorData.competitors)
        ? (competitorData.competitors as Array<Record<string, unknown>>)
        : [];
      const lines = competitors
        .filter((c) => c.name)
        .map((c) => {
          const features = Array.isArray(c.keyFeatures)
            ? (c.keyFeatures as string[]).join(", ")
            : Array.isArray(c.productFeatures)
              ? (c.productFeatures as string[]).join(", ")
              : null;
          return `${String(c.name)}: ${features || "N/A"}`;
        });
      if (lines.length > 0) {
        featureMatrix = lines.join("\n");
      }
    } else {
      // Plain text fallback: extract lines about features/capabilities from research report
      const extracted = this.extractMatchingLines(
        competitorText,
        /feature|capabilit|function|differentiator|advantage|comparison|matrix|product|solution|platform|pricing|tier/i,
        15,
      );
      if (extracted) {
        featureMatrix = extracted;
      }
    }

    let competitiveDynamicsEvidence = "Not provided";
    if (competitorData) {
      competitiveDynamicsEvidence =
        (competitorData.competitiveLandscapeSummary as string) || "Not provided";
    } else {
      // Plain text fallback: extract dynamics/barriers/market share lines
      const extracted = this.extractMatchingLines(
        competitorText,
        /market share|barrier|network effect|switching cost|moat|consolidat|m&a|dynamic|competitive landscape|threat|positioning|direct competitor|indirect competitor/i,
        15,
      );
      if (extracted) {
        competitiveDynamicsEvidence = extracted;
      }
    }

    return {
      marketResearchOutput: _pipelineData.research.market ?? "Not provided",
      productResearchOutput: _pipelineData.research.product ?? "Not provided",
      competitorProfiles: _pipelineData.research.competitor ?? "Not provided",
      featureMatrix,
      competitiveDynamicsEvidence,
    };
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
