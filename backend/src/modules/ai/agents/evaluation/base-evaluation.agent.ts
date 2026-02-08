import { Injectable } from "@nestjs/common";
import { generateObject } from "ai";
import { z } from "zod";
import type {
  EvaluationAgent,
  EvaluationAgentKey,
  EvaluationAgentResult,
  EvaluationPipelineInput,
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
  ): Promise<EvaluationAgentResult<TOutput>> {
    const context = this.buildContext(pipelineData);

    try {
      const modelFactory = this.providers.getGemini();
      const modelName = this.aiConfig.getModelForPurpose(ModelPurpose.EVALUATION);

      const { object } = await generateObject({
        model: modelFactory(modelName),
        schema: this.schema,
        system: this.systemPrompt,
        prompt: [
          "Evaluate using only provided context. Do not invent facts.",
          "Scoring rubric: 0-39 weak/high risk, 40-69 mixed/unproven, 70-84 strong with manageable risk, 85-100 exceptional evidence-backed strength.",
          "When key evidence is missing, lower confidence and avoid extreme scores unless clear risk signals exist.",
          "Keep rationales concise and directly tied to observable evidence in context.",
          "Return strict JSON matching schema only.",
          JSON.stringify(context, null, 2),
        ].join("\n\n"),
        temperature: this.aiConfig.getEvaluationTemperature(),
        maxOutputTokens: this.aiConfig.getEvaluationMaxOutputTokens(),
      });

      return {
        key: this.key,
        output: this.schema.parse(object),
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
}
