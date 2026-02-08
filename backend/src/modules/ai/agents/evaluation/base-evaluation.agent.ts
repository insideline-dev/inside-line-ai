import { Injectable } from "@nestjs/common";
import { generateText, Output } from "ai";
import { z } from "zod";
import type {
  EvaluationAgent,
  EvaluationAgentKey,
  EvaluationAgentResult,
  EvaluationPipelineInput,
  EvaluationAgentRunOptions,
} from "../../interfaces/agent.interface";
import { ModelPurpose } from "../../interfaces/pipeline.interface";
import { AiProviderService } from "../../providers/ai-provider.service";
import { AiConfigService } from "../../services/ai-config.service";

@Injectable()
export abstract class BaseEvaluationAgent<TOutput>
  implements EvaluationAgent<TOutput>
{
  abstract readonly key: EvaluationAgentKey;
  protected abstract readonly schema: z.ZodSchema<TOutput>;
  protected abstract readonly systemPrompt: string;

  constructor(
    protected providers: AiProviderService,
    protected aiConfig: AiConfigService,
  ) {}

  abstract buildContext(pipelineData: EvaluationPipelineInput): Record<string, unknown>;
  abstract fallback(pipelineData: EvaluationPipelineInput): TOutput;

  async run(
    pipelineData: EvaluationPipelineInput,
    options?: EvaluationAgentRunOptions,
  ): Promise<EvaluationAgentResult<TOutput>> {
    const context = this.buildContext(pipelineData);
    const promptContext = {
      ...context,
      startupFormContext: pipelineData.extraction.startupContext ?? {},
      adminFeedback: options?.feedbackNotes ?? [],
    };

    try {
      const modelFactory = this.providers.getGemini();
      const modelName = this.aiConfig.getModelForPurpose(ModelPurpose.EVALUATION);

      const { output } = await generateText({
        model: modelFactory(modelName),
        output: Output.object({ schema: this.schema }),
        system: [
          this.systemPrompt,
          "",
          "## Scoring Rubric",
          "0-39: Weak / high risk — significant gaps or red flags",
          "40-69: Mixed / unproven — some positives but material unknowns",
          "70-84: Strong with manageable risk — solid evidence, minor gaps",
          "85-100: Exceptional — evidence-backed strength across dimensions",
          "",
          "## Rules",
          "- Evaluate using ONLY the provided context. Do not invent facts.",
          "- When key evidence is missing, lower confidence and avoid extreme scores.",
          "- Keep rationales concise and tied to observable evidence.",
        ].join("\n"),
        prompt: this.formatContext(promptContext),
        temperature: this.aiConfig.getEvaluationTemperature(),
        maxOutputTokens: this.aiConfig.getEvaluationMaxOutputTokens(),
      });

      return {
        key: this.key,
        output: this.schema.parse(output),
        usedFallback: false,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        key: this.key,
        output: this.fallback(pipelineData),
        usedFallback: true,
        error: message,
      };
    }
  }

  private formatContext(context: Record<string, unknown>): string {
    const sections: string[] = [];
    for (const [key, value] of Object.entries(context)) {
      if (value === undefined || value === null) continue;
      const label = key
        .replace(/([A-Z])/g, " $1")
        .replace(/^./, (s) => s.toUpperCase())
        .trim();
      if (typeof value === "string") {
        sections.push(`## ${label}\n${value}`);
      } else if (Array.isArray(value) && value.length === 0) {
        continue;
      } else {
        sections.push(`## ${label}\n${JSON.stringify(value)}`);
      }
    }
    return sections.join("\n\n");
  }
}
