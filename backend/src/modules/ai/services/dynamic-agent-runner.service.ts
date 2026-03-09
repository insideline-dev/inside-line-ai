import { Injectable, Logger } from "@nestjs/common";
import { generateText, Output } from "ai";
import type {
  EvaluationPipelineInput,
  ResearchPipelineInput,
} from "../interfaces/agent.interface";
import type { StartupStage } from "../../startup/entities/startup.schema";
import type { AiPromptKey } from "./ai-prompt-catalog";
import { isAiPromptKey } from "./ai-prompt-catalog";
import { AiPromptService } from "./ai-prompt.service";
import { AgentSchemaRegistryService } from "./agent-schema-registry.service";
import { SchemaCompilerService } from "./schema-compiler.service";
import { AiProviderService } from "../providers/ai-provider.service";
import { AiConfigService } from "./ai-config.service";
import type { SchemaDescriptor, SchemaField } from "../interfaces/schema.interface";
import { ModelPurpose } from "../interfaces/pipeline.interface";
import { AiModelExecutionService } from "./ai-model-execution.service";

@Injectable()
export class DynamicAgentRunnerService {
  private readonly logger = new Logger(DynamicAgentRunnerService.name);

  constructor(
    private promptService: AiPromptService,
    private schemaRegistry: AgentSchemaRegistryService,
    private schemaCompiler: SchemaCompilerService,
    private providers: AiProviderService,
    private modelExecution: AiModelExecutionService,
    private aiConfig: AiConfigService,
  ) {}

  async run(params: {
    agentKey: string;
    promptKey: AiPromptKey | string;
    pipelineData: EvaluationPipelineInput | ResearchPipelineInput;
    stage?: StartupStage;
  }): Promise<{
    key: string;
    output: unknown;
    usedFallback: boolean;
    error?: string;
    inputPrompt: string;
    systemPrompt: string;
    outputText: string;
    attempt: number;
    retryCount: number;
  }> {
    const promptConfig = await this.promptService.resolve({
      key: params.promptKey,
      stage: params.stage,
    });

    const descriptor = await this.schemaRegistry.resolveDescriptor(
      params.promptKey,
      params.stage,
    );
    const schema = this.schemaCompiler.compile(descriptor);
    const executionOptions = isAiPromptKey(params.promptKey)
      ? await this.modelExecution.resolveForPrompt({
          key: params.promptKey,
          stage: params.stage,
        })
      : null;
    const renderedPrompt = this.promptService.renderTemplate(promptConfig.userPrompt, {
      contextJson: JSON.stringify(params.pipelineData),
    });

    const maxAttempts = 3;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const response = await generateText({
          model:
            executionOptions?.generateTextOptions.model ??
            this.providers.resolveModelForPurpose(ModelPurpose.EVALUATION),
          output: Output.object({ schema }),
          system: promptConfig.systemPrompt,
          prompt: renderedPrompt,
          temperature: this.aiConfig.getEvaluationTemperature(),
          maxOutputTokens: this.aiConfig.getEvaluationMaxOutputTokens(),
          tools: executionOptions?.generateTextOptions.tools,
          toolChoice: executionOptions?.generateTextOptions.toolChoice,
          providerOptions: executionOptions?.generateTextOptions.providerOptions,
        });

        return {
          key: params.agentKey,
          output: response.output,
          usedFallback: false,
          inputPrompt: renderedPrompt,
          systemPrompt: promptConfig.systemPrompt,
          outputText: this.safeStringify(response.output),
          attempt,
          retryCount: Math.max(0, attempt - 1),
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(
          `[${params.agentKey}] dynamic run attempt ${attempt}/${maxAttempts} failed: ${message}`,
        );
        if (attempt < maxAttempts) {
          await this.sleep(attempt * 250);
          continue;
        }

        const fallbackOutput = this.buildFallbackObject(descriptor);
        return {
          key: params.agentKey,
          output: fallbackOutput,
          usedFallback: true,
          error: message,
          inputPrompt: renderedPrompt,
          systemPrompt: promptConfig.systemPrompt,
          outputText: this.safeStringify(fallbackOutput),
          attempt,
          retryCount: Math.max(0, attempt - 1),
        };
      }
    }

    const fallbackOutput = this.buildFallbackObject(descriptor);
    return {
      key: params.agentKey,
      output: fallbackOutput,
      usedFallback: true,
      error: "Unhandled dynamic agent execution path",
      inputPrompt: renderedPrompt,
      systemPrompt: promptConfig.systemPrompt,
      outputText: this.safeStringify(fallbackOutput),
      attempt: maxAttempts,
      retryCount: Math.max(0, maxAttempts - 1),
    };
  }

  private buildFallbackObject(descriptor: SchemaDescriptor): Record<string, unknown> {
    const output: Record<string, unknown> = {};
    for (const [key, field] of Object.entries(descriptor.fields)) {
      output[key] = this.fallbackValueForField(field);
    }
    return output;
  }

  private fallbackValueForField(field: SchemaField): unknown {
    if (field.default !== undefined) {
      return field.default;
    }

    switch (field.type) {
      case "string":
        return "";
      case "number":
        return 0;
      case "boolean":
        return false;
      case "enum":
        return field.values?.[0] ?? "";
      case "array":
        return [];
      case "object": {
        const nested: Record<string, unknown> = {};
        for (const [key, nestedField] of Object.entries(field.fields ?? {})) {
          nested[key] = this.fallbackValueForField(nestedField);
        }
        return nested;
      }
      default:
        return null;
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private safeStringify(value: unknown): string {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }
}
