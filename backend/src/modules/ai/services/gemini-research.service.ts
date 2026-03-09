import { Injectable, Logger, Optional } from "@nestjs/common";
import { generateText, Output } from "ai";
import { z } from "zod";
import { INTERNAL_PIPELINE_SOURCE } from "../agents/evaluation/evaluation-utils";
import type {
  PipelineFallbackReason,
  ResearchAgentKey,
} from "../interfaces/agent.interface";
import type { SourceEntry } from "../interfaces/phase-results.interface";
import { ModelPurpose, PipelinePhase } from "../interfaces/pipeline.interface";
import { AiProviderService } from "../providers/ai-provider.service";
import { AiConfigService } from "./ai-config.service";
import { isOpenAiDeepResearchModel } from "./ai-runtime-config.schema";
import {
  OpenAiDeepResearchCheckpointEvent,
  OpenAiDeepResearchService,
} from "./openai-deep-research.service";
import { PipelineAgentTraceService } from "./pipeline-agent-trace.service";

interface ResearchRequest<TOutput extends { sources: string[] }> {
  agent: ResearchAgentKey;
  modelName?: string;
  model?: GenerateTextModel;
  tools?: GenerateTextTools;
  toolChoice?: GenerateTextToolChoice;
  stopWhen?: GenerateTextStopWhen;
  providerOptions?: GenerateTextProviderOptions;
  searchEnforcement?: {
    requiresProviderEvidence: boolean;
    requiresBraveToolCall: boolean;
  };
  getBraveToolCallCount?: () => number;
  prompt: string;
  systemPrompt: string;
  schema: z.ZodSchema<TOutput>;
  fallback: () => TOutput;
}

interface ResearchResponse<TOutput extends { sources: string[] }> {
  output: TOutput;
  sources: SourceEntry[];
  usedFallback: boolean;
  error?: string;
  fallbackReason?: PipelineFallbackReason;
  rawProviderError?: string;
  outputText?: string;
  meta?: Record<string, unknown>;
  attempt: number;
  retryCount: number;
}

interface ResearchTextRequest {
  agent: ResearchAgentKey;
  startupId?: string;
  pipelineRunId?: string;
  phaseRetryCount?: number;
  agentAttemptId?: string;
  modelName?: string;
  model?: GenerateTextModel;
  tools?: GenerateTextTools;
  toolChoice?: GenerateTextToolChoice;
  stopWhen?: GenerateTextStopWhen;
  providerOptions?: GenerateTextProviderOptions;
  searchEnforcement?: {
    requiresProviderEvidence: boolean;
    requiresBraveToolCall: boolean;
  };
  getBraveToolCallCount?: () => number;
  prompt: string;
  systemPrompt: string;
  minReportLength: number;
  fallback: () => string;
}

interface ResearchTextResponse {
  output: string;
  sources: SourceEntry[];
  usedFallback: boolean;
  error?: string;
  fallbackReason?: PipelineFallbackReason;
  rawProviderError?: string;
  outputText?: string;
  meta?: Record<string, unknown>;
  attempt: number;
  retryCount: number;
}

interface PreservedUngroundedTextInput {
  agent: ResearchAgentKey;
  outputText: string;
  error: string;
  lastSources: SourceEntry[];
  lastSourceSanitization: SourceSanitizationSummary;
  attempt: number;
}

interface SourceCarrier {
  sources?: Array<{ title?: string; url?: string }>;
  providerMetadata?: unknown;
  experimental_providerMetadata?: unknown;
}

interface SourceSanitizationSummary {
  droppedCount: number;
  droppedHosts: string[];
}

interface ExtractedSources {
  entries: SourceEntry[];
  evidenceCount: number;
  sanitization: SourceSanitizationSummary;
}

type GenerateTextModel = Parameters<typeof generateText>[0]["model"];
type GenerateTextTools = Parameters<typeof generateText>[0]["tools"];
type GenerateTextToolChoice = Parameters<typeof generateText>[0]["toolChoice"];
type GenerateTextStopWhen = Parameters<typeof generateText>[0]["stopWhen"];
type GenerateTextProviderOptions = Parameters<typeof generateText>[0]["providerOptions"];

@Injectable()
export class GeminiResearchService {
  private readonly logger = new Logger(GeminiResearchService.name);

  constructor(
    private providers: AiProviderService,
    private aiConfig: AiConfigService,
    private openAiDeepResearch: OpenAiDeepResearchService,
    @Optional() private pipelineAgentTrace?: PipelineAgentTraceService,
  ) {}

  async research<TOutput extends { sources: string[] }>(
    request: ResearchRequest<TOutput>,
  ): Promise<ResearchResponse<TOutput>> {
    const fallback = request.fallback();
    const modelName =
      request.modelName ?? this.aiConfig.getModelForPurpose(ModelPurpose.RESEARCH);
    const model =
      request.model ??
      (this.providers.resolveModelForPurpose(
        ModelPurpose.RESEARCH,
      ) as GenerateTextModel);
    const maxAttempts = this.getResearchMaxAttempts();
    const hardTimeoutMs = this.getResearchAgentHardTimeoutMs();
    const startedAt = Date.now();
    let lastError = "Unknown research error";

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const remainingBudgetMs = this.getRemainingBudgetMs(
        startedAt,
        hardTimeoutMs,
      );
      if (remainingBudgetMs <= 0) {
        lastError = `Research agent ${request.agent} exceeded hard timeout`;
        break;
      }
      const attemptTimeoutMs = this.getAttemptTimeoutMs(remainingBudgetMs);
      const structured = await this.tryStructuredAttempt({
        agent: request.agent,
        model,
        prompt: request.prompt,
        systemPrompt: request.systemPrompt,
        schema: request.schema,
        tools: request.tools,
        toolChoice: request.toolChoice,
        stopWhen: request.stopWhen,
        providerOptions: request.providerOptions,
        timeoutMs: attemptTimeoutMs,
      });
      if (structured.success) {
        const enforcement = this.resolveSearchEnforcementStatus({
          sourceCount: structured.sourceEvidenceCount,
          searchEnforcement: request.searchEnforcement,
          braveToolCallCount: request.getBraveToolCallCount?.() ?? 0,
        });
        if (enforcement.error) {
          lastError = enforcement.error;
          if (attempt < maxAttempts) {
            const delayMs = Math.min(
              this.getRetryDelayMs(attempt),
              Math.max(0, this.getRemainingBudgetMs(startedAt, hardTimeoutMs) - 50),
            );
            if (delayMs <= 0) {
              lastError = `Research agent ${request.agent} exceeded hard timeout`;
              break;
            }
            this.logger.warn(
              `Research agent ${request.agent} attempt ${attempt}/${maxAttempts} missing required search evidence, retrying in ${delayMs}ms: ${enforcement.error}`,
            );
            await this.sleep(delayMs);
            continue;
          }
          this.logger.warn(
            `Research agent ${request.agent} completed without required search evidence; using fallback instead: ${enforcement.error}`,
          );
          break;
        } else {
          const mergedSourceUrls = this.mergeSourceUrls(
            structured.data.sources,
            structured.sourceUrls,
          );
          return {
            output: {
              ...structured.data,
              sources: mergedSourceUrls.urls,
            },
            sources: structured.sources,
            usedFallback: false,
            outputText: structured.outputText,
            meta: this.withSourceSanitizationMeta(
              undefined,
              this.combineSourceSanitization(
                structured.sourceSanitization,
                mergedSourceUrls.sanitization,
              ),
            ),
            attempt,
            retryCount: Math.max(0, attempt - 1),
          };
        }
      }

      const text = await this.tryTextAttempt({
        agent: request.agent,
        model,
        prompt: request.prompt,
        systemPrompt: request.systemPrompt,
        schema: request.schema,
        tools: request.tools,
        toolChoice: request.toolChoice,
        stopWhen: request.stopWhen,
        providerOptions: request.providerOptions,
        timeoutMs: attemptTimeoutMs,
      });
      if (text.success) {
        const enforcement = this.resolveSearchEnforcementStatus({
          sourceCount: text.sourceEvidenceCount,
          searchEnforcement: request.searchEnforcement,
          braveToolCallCount: request.getBraveToolCallCount?.() ?? 0,
        });
        if (enforcement.error) {
          lastError = enforcement.error;
          if (attempt < maxAttempts) {
            const delayMs = Math.min(
              this.getRetryDelayMs(attempt),
              Math.max(0, this.getRemainingBudgetMs(startedAt, hardTimeoutMs) - 50),
            );
            if (delayMs <= 0) {
              lastError = `Research agent ${request.agent} exceeded hard timeout`;
              break;
            }
            this.logger.warn(
              `Research agent ${request.agent} attempt ${attempt}/${maxAttempts} missing required search evidence, retrying in ${delayMs}ms: ${enforcement.error}`,
            );
            await this.sleep(delayMs);
            continue;
          }
          this.logger.warn(
            `Research agent ${request.agent} completed without required search evidence; using fallback instead: ${enforcement.error}`,
          );
          break;
        } else {
          const mergedSourceUrls = this.mergeSourceUrls(
            text.data.sources,
            text.sourceUrls,
          );
          return {
            output: {
              ...text.data,
              sources: mergedSourceUrls.urls,
            },
            sources: text.sources,
            usedFallback: false,
            outputText: text.outputText,
            meta: this.withSourceSanitizationMeta(
              undefined,
              this.combineSourceSanitization(
                text.sourceSanitization,
                mergedSourceUrls.sanitization,
              ),
            ),
            attempt,
            retryCount: Math.max(0, attempt - 1),
          };
        }
      }

      const errorMessage = this.joinErrorMessages(structured.error, text.error);
      lastError = errorMessage;
      const shouldRetry =
        attempt < maxAttempts &&
        (structured.retryable || text.retryable || this.isRetryableParseError(errorMessage));
      if (shouldRetry) {
        const delayMs = Math.min(
          this.getRetryDelayMs(attempt),
          Math.max(0, this.getRemainingBudgetMs(startedAt, hardTimeoutMs) - 50),
        );
        if (delayMs <= 0) {
          lastError = `Research agent ${request.agent} exceeded hard timeout`;
          break;
        }
        this.logger.warn(
          `Research agent ${request.agent} attempt ${attempt}/${maxAttempts} failed, retrying in ${delayMs}ms: ${errorMessage}`,
        );
        await this.sleep(delayMs);
        continue;
      }

      const promptSize = request.prompt.length + request.systemPrompt.length;
      const mergedSources = this.mergeSourceEntries(structured.sources, text.sources);
      const sourceUrls = this.mergeSourceUrls(
        this.extractSourceUrls(structured.sources),
        this.extractSourceUrls(text.sources),
      );
      const fallbackSources = Array.isArray(fallback.sources) ? fallback.sources : [];
      const mergedFallbackSourceUrls = this.mergeSourceUrls(
        fallbackSources,
        sourceUrls.urls,
      );
      const fallbackReason = this.classifyFallbackReason(errorMessage);
      this.logger.warn(
        `Research agent ${request.agent} failed (model: ${modelName}, prompt size: ${promptSize}), using fallback: ${errorMessage}`,
      );
      return {
        output: {
          ...fallback,
          sources: mergedFallbackSourceUrls.urls,
        },
        sources: mergedSources.length > 0 ? mergedSources : this.toInternalSource(request.agent),
        usedFallback: true,
        error: errorMessage,
        fallbackReason,
        rawProviderError: this.resolveRawProviderError(errorMessage, fallbackReason),
        outputText: text.outputText ?? structured.outputText,
        meta: this.withSourceSanitizationMeta(
          undefined,
          this.combineSourceSanitization(
            sourceUrls.sanitization,
            mergedFallbackSourceUrls.sanitization,
          ),
        ),
        attempt,
        retryCount: Math.max(0, attempt - 1),
      };
    }

    const finalFallbackReason = this.classifyFallbackReason(lastError);
    const sanitizedFallbackSources = this.mergeSourceUrls(
      Array.isArray(fallback.sources) ? fallback.sources : [],
      [],
    );
    return {
      output: {
        ...fallback,
        sources: sanitizedFallbackSources.urls,
      },
      sources: this.toInternalSource(request.agent),
      usedFallback: true,
      error: lastError,
      fallbackReason: finalFallbackReason,
      rawProviderError: this.resolveRawProviderError(lastError, finalFallbackReason),
      meta: this.withSourceSanitizationMeta(
        undefined,
        sanitizedFallbackSources.sanitization,
      ),
      attempt: maxAttempts,
      retryCount: Math.max(0, maxAttempts - 1),
    };
  }

  async researchText(request: ResearchTextRequest): Promise<ResearchTextResponse> {
    const fallback = request.fallback().trim();
    const modelName =
      request.modelName ?? this.aiConfig.getModelForPurpose(ModelPurpose.RESEARCH);
    const model =
      request.model ??
      (this.providers.resolveModelForPurpose(
        ModelPurpose.RESEARCH,
      ) as GenerateTextModel);
    const maxAttempts = this.getResearchMaxAttempts();
    const hardTimeoutMs = this.getResearchAgentHardTimeoutMs();
    const startedAt = Date.now();
    let lastError = "Unknown research error";
    let lastOutputText = "";
    let lastSources: SourceEntry[] = [];
    let lastSourceSanitization: SourceSanitizationSummary = {
      droppedCount: 0,
      droppedHosts: [],
    };

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const remainingBudgetMs = this.getRemainingBudgetMs(startedAt, hardTimeoutMs);
      if (remainingBudgetMs <= 0) {
        lastError = `Research agent ${request.agent} exceeded hard timeout`;
        break;
      }

      const attemptTimeoutMs = this.getAttemptTimeoutMs(remainingBudgetMs);
      try {
        let extractedSources: ExtractedSources;
        let meta: Record<string, unknown> | undefined;

        if (isOpenAiDeepResearchModel(modelName)) {
          try {
            const checkpoint = await this.getDeepResearchResumeCheckpoint(request);
            const resumeResponseId = checkpoint?.responseId;
            const deepResearch = await this.withTimeout(
              (abortSignal) =>
                this.openAiDeepResearch.runResearchText({
                  agent: request.agent,
                  modelName,
                  systemPrompt: request.systemPrompt,
                  prompt: request.prompt,
                  enableWebSearch:
                    request.searchEnforcement?.requiresProviderEvidence ?? false,
                  timeoutMs: attemptTimeoutMs,
                  resumeResponseId,
                  abortSignal,
                  onCheckpoint: async (event) => {
                    await this.persistDeepResearchCheckpoint(request, event);
                  },
                }),
              attemptTimeoutMs,
              `Research agent ${request.agent} timed out`,
            );

            extractedSources = {
              entries: deepResearch.sources,
              evidenceCount: deepResearch.sources.length,
              sanitization: {
                droppedCount: 0,
                droppedHosts: [],
              },
            };
            lastOutputText = deepResearch.text.trim();
            meta = {
              deepResearch: {
                ...deepResearch.rawMeta,
                ...(resumeResponseId
                  ? { resumedFromCheckpoint: true, resumeResponseId }
                  : {}),
                ...(checkpoint ? { checkpoint } : {}),
              },
            };
          } catch (deepResearchError) {
            const errorMessage = this.errorMessage(deepResearchError);
            this.logger.warn(
              `Research text agent ${request.agent} deep research failed; falling back to standard text generation: ${errorMessage}`,
            );
            const standardText = await this.runStandardTextGeneration({
              agent: request.agent,
              model,
              systemPrompt: request.systemPrompt,
              prompt: request.prompt,
              tools: request.tools,
              toolChoice: request.toolChoice,
              stopWhen: request.stopWhen,
              providerOptions: request.providerOptions,
              timeoutMs: attemptTimeoutMs,
            });
            extractedSources = standardText.extractedSources;
            lastOutputText = standardText.outputText.trim();
            meta = {
              deepResearch: {
                degradedToStandardText: true,
                error: errorMessage,
                modelName,
              },
            };
          }
        } else {
          const standardText = await this.runStandardTextGeneration({
            agent: request.agent,
            model,
            systemPrompt: request.systemPrompt,
            prompt: request.prompt,
            tools: request.tools,
            toolChoice: request.toolChoice,
            stopWhen: request.stopWhen,
            providerOptions: request.providerOptions,
            timeoutMs: attemptTimeoutMs,
          });
          extractedSources = standardText.extractedSources;
          lastOutputText = standardText.outputText.trim();
        }

        lastSources = extractedSources.entries;
        lastSourceSanitization = extractedSources.sanitization;

        const enforcement = this.resolveSearchEnforcementStatus({
          sourceCount: extractedSources.evidenceCount,
          searchEnforcement: request.searchEnforcement,
          braveToolCallCount: request.getBraveToolCallCount?.() ?? 0,
        });
        if (enforcement.error) {
          lastError = enforcement.error;
          if (attempt < maxAttempts) {
            const delayMs = Math.min(
              this.getRetryDelayMs(attempt),
              Math.max(0, this.getRemainingBudgetMs(startedAt, hardTimeoutMs) - 50),
            );
            if (delayMs <= 0) {
              lastError = `Research agent ${request.agent} exceeded hard timeout`;
              break;
            }
            this.logger.warn(
              `Research text agent ${request.agent} attempt ${attempt}/${maxAttempts} missing required search evidence, retrying in ${delayMs}ms: ${enforcement.error}`,
            );
            await this.sleep(delayMs);
            continue;
          }
          if (lastOutputText.length >= request.minReportLength) {
            this.logger.warn(
              `Research text agent ${request.agent} completed without required search evidence; preserving generated output in degraded mode: ${enforcement.error}`,
            );
            return this.preserveUngroundedTextOutput({
              agent: request.agent,
              outputText: lastOutputText,
              error: enforcement.error,
              lastSources,
              lastSourceSanitization,
              attempt,
            });
          }
        }

        if (lastOutputText.length < request.minReportLength) {
          lastError = `Research report too short (${lastOutputText.length} chars, required ${request.minReportLength})`;
          if (attempt < maxAttempts) {
            const delayMs = Math.min(
              this.getRetryDelayMs(attempt),
              Math.max(0, this.getRemainingBudgetMs(startedAt, hardTimeoutMs) - 50),
            );
            if (delayMs <= 0) {
              lastError = `Research agent ${request.agent} exceeded hard timeout`;
              break;
            }
            this.logger.warn(
              `Research text agent ${request.agent} attempt ${attempt}/${maxAttempts} produced short output, retrying in ${delayMs}ms: ${lastError}`,
            );
            await this.sleep(delayMs);
            continue;
          }
        }

        if (lastOutputText.length < request.minReportLength) {
          break;
        }

        return {
          output: lastOutputText,
          sources: extractedSources.entries,
          usedFallback: false,
          outputText: lastOutputText,
          meta: this.withSourceSanitizationMeta(meta, extractedSources.sanitization),
          attempt,
          retryCount: Math.max(0, attempt - 1),
        };
      } catch (error) {
        lastError = this.errorMessage(error);
        if (attempt < maxAttempts && this.isRetryableError(lastError)) {
          const delayMs = Math.min(
            this.getRetryDelayMs(attempt),
            Math.max(0, this.getRemainingBudgetMs(startedAt, hardTimeoutMs) - 50),
          );
          if (delayMs <= 0) {
            lastError = `Research agent ${request.agent} exceeded hard timeout`;
            break;
          }
          this.logger.warn(
            `Research text agent ${request.agent} attempt ${attempt}/${maxAttempts} failed, retrying in ${delayMs}ms: ${lastError}`,
          );
          await this.sleep(delayMs);
          continue;
        }
        break;
      }
    }

    const fallbackReason = this.classifyFallbackReason(lastError);
    this.logger.warn(
      `Research text agent ${request.agent} failed (model: ${modelName}), using fallback: ${lastError}`,
    );
    return {
      output: fallback,
      sources: lastSources.length > 0 ? lastSources : this.toInternalSource(request.agent),
      usedFallback: true,
      error: lastError,
      fallbackReason,
      rawProviderError: this.resolveRawProviderError(lastError, fallbackReason),
      outputText: lastOutputText.length > 0 ? lastOutputText : fallback,
      meta: this.withSourceSanitizationMeta(
        undefined,
        lastSourceSanitization,
      ),
      attempt: maxAttempts,
      retryCount: Math.max(0, maxAttempts - 1),
    };
  }

  private async runStandardTextGeneration(input: {
    agent: ResearchAgentKey;
    model: GenerateTextModel;
    systemPrompt: string;
    prompt: string;
    tools?: GenerateTextTools;
    toolChoice?: GenerateTextToolChoice;
    stopWhen?: GenerateTextStopWhen;
    providerOptions?: GenerateTextProviderOptions;
    timeoutMs: number;
  }): Promise<{
    outputText: string;
    extractedSources: ExtractedSources;
  }> {
    const response = await this.withTimeout(
      (abortSignal) =>
        generateText({
          model: input.model,
          system: input.systemPrompt,
          prompt: input.prompt,
          tools: input.tools,
          toolChoice: input.toolChoice,
          stopWhen: input.stopWhen,
          providerOptions: input.providerOptions,
          temperature: this.aiConfig.getResearchTemperature(),
          abortSignal,
        }),
      input.timeoutMs,
      `Research agent ${input.agent} timed out`,
    );

    const responseRecord = (response ?? {}) as SourceCarrier & { text?: string };
    return {
      extractedSources: this.extractSources(responseRecord, input.agent),
      outputText: this.resolveRawOutputText(responseRecord, undefined),
    };
  }

  private async tryStructuredAttempt<TOutput extends { sources: string[] }>(input: {
    agent: ResearchAgentKey;
    model: GenerateTextModel;
    prompt: string;
    systemPrompt: string;
    schema: z.ZodSchema<TOutput>;
    tools?: GenerateTextTools;
    toolChoice?: GenerateTextToolChoice;
    stopWhen?: GenerateTextStopWhen;
    providerOptions?: GenerateTextProviderOptions;
    timeoutMs: number;
  }): Promise<
    | {
        success: true;
        data: TOutput;
        sources: SourceEntry[];
        sourceUrls: string[];
        sourceEvidenceCount: number;
        sourceSanitization: SourceSanitizationSummary;
        outputText: string;
      }
    | {
        success: false;
        error: string;
        retryable: boolean;
        sources: SourceEntry[];
        outputText?: string;
      }
  > {
    try {
      const response = await this.withTimeout(
        (abortSignal) =>
          generateText({
            model: input.model,
            system: input.systemPrompt,
            prompt: input.prompt,
            output: Output.object({ schema: input.schema }),
            tools: input.tools,
            toolChoice: input.toolChoice,
            stopWhen: input.stopWhen,
            providerOptions: input.providerOptions,
            temperature: this.aiConfig.getResearchTemperature(),
            abortSignal,
          }),
        input.timeoutMs,
        `Research agent ${input.agent} timed out`,
      );

      const parsed = input.schema.safeParse(response.output);
      if (!parsed.success) {
        const textFallback = this.parseTextToObject(
          this.resolveRawOutputText(response, undefined),
          input.schema,
        );
        if (textFallback.success) {
          const extractedSources = this.extractSources(
            response as SourceCarrier,
            input.agent,
          );
          return {
            success: true,
            data: textFallback.data,
            sources: extractedSources.entries,
            sourceUrls: this.extractSourceUrls(extractedSources.entries),
            sourceEvidenceCount: extractedSources.evidenceCount,
            sourceSanitization: extractedSources.sanitization,
            outputText: this.resolveRawOutputText(response, textFallback.data),
          };
        }

        const schemaError = this.formatSchemaIssues(parsed.error);
        const error = schemaError.length > 0
          ? `Schema validation failed: ${schemaError}; ${textFallback.error}`
          : `Schema validation failed: ${textFallback.error}`;
        return {
          success: false,
          error,
          retryable: true,
          sources: this.extractSources(response as SourceCarrier, input.agent).entries,
          outputText: this.resolveRawOutputText(response, response.output),
        };
      }

      const extractedSources = this.extractSources(
        response as SourceCarrier,
        input.agent,
      );
      return {
        success: true,
        data: parsed.data,
        sources: extractedSources.entries,
        sourceUrls: this.extractSourceUrls(extractedSources.entries),
        sourceEvidenceCount: extractedSources.evidenceCount,
        sourceSanitization: extractedSources.sanitization,
        outputText: this.resolveRawOutputText(response, parsed.data),
      };
    } catch (error) {
      const message = this.errorMessage(error);
      return {
        success: false,
        error: message,
        retryable:
          this.isRetryableError(message) ||
          this.isRetryableParseError(message) ||
          this.isNoStructuredOutputError(message),
        sources: [],
      };
    }
  }

  private async tryTextAttempt<TOutput>(input: {
    agent: ResearchAgentKey;
    model: GenerateTextModel;
    prompt: string;
    systemPrompt: string;
    schema: z.ZodSchema<TOutput>;
    tools?: GenerateTextTools;
    toolChoice?: GenerateTextToolChoice;
    stopWhen?: GenerateTextStopWhen;
    providerOptions?: GenerateTextProviderOptions;
    timeoutMs: number;
  }): Promise<
    | {
        success: true;
        data: TOutput;
        sources: SourceEntry[];
        sourceUrls: string[];
        sourceEvidenceCount: number;
        sourceSanitization: SourceSanitizationSummary;
        outputText: string;
      }
    | {
        success: false;
        error: string;
        retryable: boolean;
        sources: SourceEntry[];
        outputText?: string;
      }
  > {
    try {
      const response = await this.withTimeout(
        (abortSignal) =>
          generateText({
            model: input.model,
            system: input.systemPrompt,
            prompt: input.prompt,
            tools: input.tools,
            toolChoice: input.toolChoice,
            stopWhen: input.stopWhen,
            providerOptions: input.providerOptions,
            temperature: this.aiConfig.getResearchTemperature(),
            abortSignal,
          }),
        input.timeoutMs,
        `Research agent ${input.agent} timed out`,
      );

      const responseRecord = (response ?? {}) as SourceCarrier & { text?: string };
      const outputText = this.resolveRawOutputText(responseRecord, undefined);
      const parsed = this.parseTextToObject(outputText, input.schema);
      if (!parsed.success) {
        return {
          success: false,
          error: parsed.error,
          retryable: this.isRetryableParseError(parsed.error),
          sources: this.extractSources(responseRecord, input.agent).entries,
          outputText,
        };
      }

      const extractedSources = this.extractSources(responseRecord, input.agent);
      return {
        success: true,
        data: parsed.data,
        sources: extractedSources.entries,
        sourceUrls: this.extractSourceUrls(extractedSources.entries),
        sourceEvidenceCount: extractedSources.evidenceCount,
        sourceSanitization: extractedSources.sanitization,
        outputText,
      };
    } catch (error) {
      const message = this.errorMessage(error);
      return {
        success: false,
        error: message,
        retryable: this.isRetryableError(message),
        sources: [],
      };
    }
  }

  private getRetryDelayMs(attempt: number): number {
    const baseMs = 750 * 2 ** Math.max(0, attempt - 1);
    const jitter = Math.floor(Math.random() * 250);
    return baseMs + jitter;
  }

  private isRetryableError(message: string): boolean {
    const normalized = message.toLowerCase();
    const retryablePatterns = [
      "timed out",
      "timeout",
      "rate limit",
      "429",
      "503",
      "502",
      "network",
      "connection",
      "socket",
      "temporarily unavailable",
    ];
    return retryablePatterns.some((pattern) => normalized.includes(pattern));
  }

  private isRetryableParseError(message: string): boolean {
    const normalized = message.toLowerCase();
    return (
      normalized.includes("schema validation failed") ||
      normalized.includes("parseable json payload") ||
      normalized.includes("no output generated") ||
      normalized.includes("no object generated")
    );
  }

  private isNoStructuredOutputError(message: string): boolean {
    const normalized = message.toLowerCase();
    return (
      normalized.includes("no output generated") ||
      normalized.includes("no object generated") ||
      normalized.includes("empty response")
    );
  }

  private resolveSearchEnforcementStatus(input: {
    sourceCount: number;
    searchEnforcement?: {
      requiresProviderEvidence: boolean;
      requiresBraveToolCall: boolean;
    };
    braveToolCallCount: number;
  }): {
    error: string | null;
    missingProviderEvidence: boolean;
    missingBraveToolCall: boolean;
  } {
    const enforcement = input.searchEnforcement;
    if (!enforcement) {
      return {
        error: null,
        missingProviderEvidence: false,
        missingBraveToolCall: false,
      };
    }

    const missingProviderEvidence =
      enforcement.requiresProviderEvidence && input.sourceCount === 0;
    const missingBraveToolCall =
      enforcement.requiresBraveToolCall && input.braveToolCallCount <= 0;

    if (missingProviderEvidence) {
      return {
        error: "Provider search evidence is required but no grounded sources were returned",
        missingProviderEvidence,
        missingBraveToolCall,
      };
    }

    if (missingBraveToolCall) {
      // Gemini provider-grounded search can return grounded sources without invoking
      // the custom Brave tool callback. Avoid rejecting valid grounded outputs in that case.
      if (enforcement.requiresProviderEvidence && input.sourceCount > 0) {
        this.logger.warn(
          "Allowing grounded research result without explicit Brave tool callback because provider evidence was present",
        );
        return {
          error: null,
          missingProviderEvidence,
          missingBraveToolCall: false,
        };
      }
      return {
        error: "Brave search tool usage is required but the tool was not called",
        missingProviderEvidence,
        missingBraveToolCall,
      };
    }

    return {
      error: null,
      missingProviderEvidence,
      missingBraveToolCall,
    };
  }

  private classifyFallbackReason(message: string): PipelineFallbackReason {
    const normalized = message.toLowerCase();
    if (
      normalized.includes("provider search evidence is required") &&
      normalized.includes("no grounded sources were returned")
    ) {
      return "MISSING_PROVIDER_EVIDENCE";
    }
    if (
      normalized.includes("brave search tool usage is required") &&
      normalized.includes("tool was not called")
    ) {
      return "MISSING_BRAVE_TOOL_CALL";
    }
    if (normalized.includes("timed out") || normalized.includes("timeout")) {
      return "TIMEOUT";
    }
    if (
      normalized.includes("schema validation failed") ||
      normalized.includes("parseable json payload") ||
      normalized.includes("no output generated") ||
      normalized.includes("no object generated") ||
      normalized.includes("empty response")
    ) {
      return "SCHEMA_OUTPUT_INVALID";
    }
    if (
      normalized.includes("rate limit") ||
      normalized.includes("429") ||
      normalized.includes("provider") ||
      normalized.includes("model")
    ) {
      return "MODEL_OR_PROVIDER_ERROR";
    }
    return "UNHANDLED_AGENT_EXCEPTION";
  }

  private resolveRawProviderError(
    message: string,
    fallbackReason: PipelineFallbackReason,
  ): string | undefined {
    if (
      fallbackReason === "MISSING_PROVIDER_EVIDENCE" ||
      fallbackReason === "MISSING_BRAVE_TOOL_CALL"
    ) {
      return undefined;
    }
    if (message.trim().length === 0) {
      return undefined;
    }
    return message.slice(0, 2_000);
  }

  private preserveUngroundedTextOutput(
    input: PreservedUngroundedTextInput,
  ): ResearchTextResponse {
    const fallbackReason = this.classifyFallbackReason(input.error);
    return {
      output: input.outputText,
      sources:
        input.lastSources.length > 0
          ? input.lastSources
          : this.toInternalSource(input.agent),
      usedFallback: true,
      error: input.error,
      fallbackReason,
      rawProviderError: this.resolveRawProviderError(input.error, fallbackReason),
      outputText: input.outputText,
      meta: this.withSourceSanitizationMeta(
        { preservedUngroundedOutput: true },
        input.lastSourceSanitization,
      ),
      attempt: input.attempt,
      retryCount: Math.max(0, input.attempt - 1),
    };
  }

  private async sleep(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  private parseTextToObject<TOutput>(
    text: string,
    schema: z.ZodSchema<TOutput>,
  ): { success: true; data: TOutput } | { success: false; error: string } {
    const candidate = this.extractJsonCandidate(text);
    if (!candidate) {
      return {
        success: false,
        error: "Grounded response did not contain parseable JSON payload",
      };
    }

    const parsed = schema.safeParse(candidate);
    if (!parsed.success) {
      const issues = this.formatSchemaIssues(parsed.error);
      return {
        success: false,
        error: issues.length > 0
          ? `Schema validation failed: ${issues}`
          : "Schema validation failed",
      };
    }

    return { success: true, data: parsed.data };
  }

  private extractJsonCandidate(text: string): unknown {
    const direct = this.tryParseJsonObject(text.trim());
    if (direct) {
      return direct;
    }

    const fencedMatches = text.matchAll(/```(?:json)?\s*([\s\S]*?)\s*```/gi);
    for (const match of fencedMatches) {
      if (!match[1]) {
        continue;
      }
      const parsed = this.tryParseJsonObject(match[1]);
      if (parsed) {
        return parsed;
      }
    }

    const unescapedQuoted = this.tryParseEscapedJsonString(text.trim());
    if (unescapedQuoted) {
      return unescapedQuoted;
    }

    for (const candidate of this.extractBalancedJsonObjects(text)) {
      const parsed = this.tryParseJsonObject(candidate);
      if (parsed) {
        return parsed;
      }
    }

    return null;
  }

  private tryParseEscapedJsonString(text: string): unknown {
    if (!text.startsWith("\"") || !text.endsWith("\"")) {
      return null;
    }

    try {
      const unescaped = JSON.parse(text);
      if (typeof unescaped !== "string") {
        return null;
      }
      return this.tryParseJsonObject(unescaped);
    } catch {
      return null;
    }
  }

  private tryParseJsonObject(text: string): unknown {
    if (!text) {
      return null;
    }

    try {
      const parsed = JSON.parse(text);
      if (typeof parsed !== "object" || Array.isArray(parsed) || parsed === null) {
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }

  private extractBalancedJsonObjects(text: string): string[] {
    const candidates: string[] = [];
    let start = -1;
    let depth = 0;
    let inString = false;
    let escaping = false;

    for (let index = 0; index < text.length; index += 1) {
      const char = text[index];

      if (escaping) {
        escaping = false;
        continue;
      }
      if (char === "\\") {
        escaping = true;
        continue;
      }
      if (char === "\"") {
        inString = !inString;
        continue;
      }
      if (inString) {
        continue;
      }
      if (char === "{") {
        if (depth === 0) {
          start = index;
        }
        depth += 1;
        continue;
      }
      if (char === "}" && depth > 0) {
        depth -= 1;
        if (depth === 0 && start >= 0) {
          candidates.push(text.slice(start, index + 1));
          start = -1;
        }
      }
    }

    return candidates;
  }

  private mergeSourceUrls(
    existing: string[],
    extracted: string[],
  ): { urls: string[]; sanitization: SourceSanitizationSummary } {
    const dedupe = new Set<string>();
    const droppedHosts = new Set<string>();
    let droppedCount = 0;

    for (const candidate of [...existing, ...extracted]) {
      const sanitized = this.sanitizeSourceUrl(candidate);
      if (!sanitized.url) {
        droppedCount += 1;
        if (sanitized.droppedHost) {
          droppedHosts.add(sanitized.droppedHost);
        }
        continue;
      }
      dedupe.add(sanitized.url);
    }

    return {
      urls: Array.from(dedupe),
      sanitization: {
        droppedCount,
        droppedHosts: Array.from(droppedHosts),
      },
    };
  }

  private formatSchemaIssues(error: z.ZodError): string {
    const preview = error.issues.slice(0, 6).map((issue) => {
      const path = issue.path.length > 0
        ? issue.path
            .map((segment) =>
              typeof segment === "number" ? `[${segment}]` : String(segment),
            )
            .join(".")
            .replace(".[", "[")
        : "(root)";
      return `${path}: ${issue.message}`;
    });

    if (preview.length === 0) {
      return "";
    }
    if (error.issues.length <= preview.length) {
      return preview.join(" | ");
    }
    return `${preview.join(" | ")} | +${error.issues.length - preview.length} more issue(s)`;
  }

  private extractSources(
    response: SourceCarrier,
    agent: ResearchAgentKey,
  ): ExtractedSources {
    const dedupe = new Map<string, SourceEntry>();
    const droppedHosts = new Set<string>();
    let droppedCount = 0;
    let evidenceCount = 0;
    const config = this.aiConfig as Partial<AiConfigService>;
    const sanitizeEnabled =
      typeof config.isSourceSanitizationEnabled === "function"
        ? config.isSourceSanitizationEnabled()
        : true;

    const addSource = (url: string | undefined, name: string) => {
      if (!url) {
        return;
      }

      evidenceCount += 1;
      const sanitized = sanitizeEnabled ? this.sanitizeSourceUrl(url) : { url };
      if (!sanitized.url) {
        droppedCount += 1;
        if (sanitized.droppedHost) {
          droppedHosts.add(sanitized.droppedHost);
        }
        return;
      }

      const key = sanitized.url;
      if (dedupe.has(key)) {
        return;
      }

      dedupe.set(key, {
        name,
        url: sanitized.url,
        type: "search",
        agent,
        timestamp: new Date().toISOString(),
      });
    };

    for (const source of response.sources ?? []) {
      addSource(source.url, source.title ?? "Search source");
    }

    const providerMetadata =
      this.asRecord(response.providerMetadata)?.google ??
      this.asRecord(response.experimental_providerMetadata)?.google;

    const groundingMetadata = this.asRecord(providerMetadata)?.groundingMetadata;
    const chunks = this.asRecord(groundingMetadata)?.groundingChunks;

    if (Array.isArray(chunks)) {
      for (const chunk of chunks) {
        const web = this.asRecord(chunk)?.web;
        const url = this.readString(this.asRecord(web)?.uri);
        const title = this.readString(this.asRecord(web)?.title);
        addSource(url, title ?? "Grounding source");
      }
    }

    return {
      entries: Array.from(dedupe.values()),
      evidenceCount,
      sanitization: {
        droppedCount,
        droppedHosts: Array.from(droppedHosts),
      },
    };
  }

  private extractSourceUrls(sources: SourceEntry[]): string[] {
    return sources
      .map((entry) => entry.url)
      .filter((url): url is string => Boolean(url));
  }

  private withSourceSanitizationMeta(
    meta: Record<string, unknown> | undefined,
    summary: SourceSanitizationSummary | undefined,
  ): Record<string, unknown> | undefined {
    if (!summary || summary.droppedCount <= 0) {
      return meta;
    }

    return {
      ...(meta ?? {}),
      sourceSanitization: {
        droppedCount: summary.droppedCount,
        droppedHosts: summary.droppedHosts,
      },
    };
  }

  private combineSourceSanitization(
    first: SourceSanitizationSummary | undefined,
    second: SourceSanitizationSummary | undefined,
  ): SourceSanitizationSummary | undefined {
    if (!first && !second) {
      return undefined;
    }

    return {
      droppedCount: (first?.droppedCount ?? 0) + (second?.droppedCount ?? 0),
      droppedHosts: Array.from(
        new Set([...(first?.droppedHosts ?? []), ...(second?.droppedHosts ?? [])]),
      ),
    };
  }

  private sanitizeSourceUrl(
    value: string,
  ): { url?: string; droppedHost?: string } {
    const normalized = value.trim();
    if (normalized.length === 0) {
      return {};
    }

    try {
      const parsed = new URL(normalized);
      const host = parsed.hostname.toLowerCase();
      if (host === "vertexaisearch.cloud.google.com") {
        return { droppedHost: host };
      }
      return { url: normalized };
    } catch {
      return { url: normalized };
    }
  }

  private mergeSourceEntries(
    first: SourceEntry[],
    second: SourceEntry[],
  ): SourceEntry[] {
    const dedupe = new Map<string, SourceEntry>();
    for (const source of [...first, ...second]) {
      const key = source.url ?? `${source.agent}:${source.name}`;
      if (!dedupe.has(key)) {
        dedupe.set(key, source);
      }
    }
    return Array.from(dedupe.values());
  }

  private toInternalSource(agent: ResearchAgentKey): SourceEntry[] {
    return [
      {
        name: "internal pipeline context",
        url: INTERNAL_PIPELINE_SOURCE,
        type: "document",
        agent,
        timestamp: new Date().toISOString(),
      },
    ];
  }

  private asRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== "object") {
      return null;
    }

    return value as Record<string, unknown>;
  }

  private readString(value: unknown): string | undefined {
    return typeof value === "string" && value.length > 0 ? value : undefined;
  }

  private resolveRawOutputText(
    response: { text?: string },
    output?: unknown,
  ): string {
    if (typeof response.text === "string" && response.text.trim().length > 0) {
      return response.text;
    }
    if (output !== undefined) {
      return this.safeStringify(output);
    }
    return "";
  }

  private safeStringify(value: unknown): string {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  private joinErrorMessages(first: string, second: string): string {
    if (!first) {
      return second;
    }
    if (!second || first === second) {
      return first;
    }
    return `${first}; ${second}`;
  }

  private getAttemptTimeoutMs(remainingBudgetMs: number): number {
    const configuredAttemptTimeout = this.getResearchAttemptTimeoutMs();
    const boundedTimeout = Math.min(configuredAttemptTimeout, remainingBudgetMs);
    return Math.max(1, boundedTimeout);
  }

  private getRemainingBudgetMs(startedAt: number, hardTimeoutMs: number): number {
    if (!Number.isFinite(hardTimeoutMs) || hardTimeoutMs <= 0) {
      return Number.MAX_SAFE_INTEGER;
    }

    return hardTimeoutMs - (Date.now() - startedAt);
  }

  private getResearchAttemptTimeoutMs(): number {
    const config = this.aiConfig as Partial<AiConfigService> & {
      getResearchTimeoutMs?: () => number;
    };
    if (typeof config.getResearchAttemptTimeoutMs === "function") {
      return config.getResearchAttemptTimeoutMs();
    }
    if (typeof config.getResearchTimeoutMs === "function") {
      return config.getResearchTimeoutMs();
    }
    return 90_000;
  }

  private getResearchMaxAttempts(): number {
    const config = this.aiConfig as Partial<AiConfigService>;
    if (typeof config.getResearchMaxAttempts === "function") {
      return config.getResearchMaxAttempts();
    }
    return 3;
  }

  private getResearchAgentHardTimeoutMs(): number {
    const config = this.aiConfig as Partial<AiConfigService>;
    if (typeof config.getResearchAgentHardTimeoutMs === "function") {
      return config.getResearchAgentHardTimeoutMs();
    }
    return this.getResearchAttemptTimeoutMs() * this.getResearchMaxAttempts() + 30_000;
  }

  private async getDeepResearchResumeCheckpoint(
    request: ResearchTextRequest,
  ): Promise<{ responseId: string } | null> {
    if (!this.pipelineAgentTrace) {
      return null;
    }
    if (!request.startupId || !request.pipelineRunId) {
      return null;
    }

    try {
      const checkpoint =
        await this.pipelineAgentTrace.getLatestDeepResearchCheckpoint({
          startupId: request.startupId,
          pipelineRunId: request.pipelineRunId,
          phase: PipelinePhase.RESEARCH,
          agentKey: request.agent,
        });
      if (!checkpoint) {
        return null;
      }
      if (this.isDeepResearchTerminalStatus(checkpoint.status)) {
        return null;
      }
      return {
        responseId: checkpoint.responseId,
      };
    } catch (error) {
      this.logger.warn(
        `Failed to load deep research checkpoint for ${request.agent}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return null;
    }
  }

  private async persistDeepResearchCheckpoint(
    request: ResearchTextRequest,
    event: OpenAiDeepResearchCheckpointEvent,
  ): Promise<void> {
    if (!this.pipelineAgentTrace) {
      return;
    }
    if (!request.startupId || !request.pipelineRunId) {
      return;
    }
    if (!event.responseId?.trim()) {
      return;
    }

    try {
      await this.pipelineAgentTrace.recordDeepResearchCheckpoint({
        startupId: request.startupId,
        pipelineRunId: request.pipelineRunId,
        phase: PipelinePhase.RESEARCH,
        agentKey: request.agent,
        responseId: event.responseId,
        status: event.status ?? "in_progress",
        modelName: event.modelName ?? request.modelName,
        resumed: event.resumed,
        pollIntervalMs: event.pollIntervalMs,
        timeoutMs: event.timeoutMs,
        phaseRetryCount: this.resolvePhaseRetryCount(request.phaseRetryCount),
        agentAttemptId: request.agentAttemptId,
        checkpointEvent: event.checkpointEvent,
      });
    } catch (error) {
      this.logger.warn(
        `Failed to persist deep research checkpoint for ${request.agent}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private resolvePhaseRetryCount(value: number | undefined): number {
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
      return 0;
    }
    return Math.floor(value);
  }

  private isDeepResearchTerminalStatus(status: string | undefined): boolean {
    if (!status) {
      return false;
    }
    const normalized = status.trim().toLowerCase();
    return (
      normalized === "completed" ||
      normalized === "failed" ||
      normalized === "cancelled" ||
      normalized === "incomplete" ||
      normalized === "expired"
    );
  }

  private async withTimeout<T>(
    operation: (abortSignal: AbortSignal | undefined) => Promise<T>,
    timeoutMs: number,
    message: string,
  ): Promise<T> {
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
      return operation(undefined);
    }

    return await new Promise<T>((resolve, reject) => {
      const controller =
        typeof AbortController === "undefined" ? undefined : new AbortController();
      let settled = false;
      const complete = (fn: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        fn();
      };
      const timer = setTimeout(() => {
        try {
          controller?.abort(new Error(message));
        } catch {
          controller?.abort();
        }
        complete(() => reject(new Error(message)));
      }, timeoutMs);
      Promise.resolve(operation(controller?.signal))
        .then((result) => {
          complete(() => resolve(result));
        })
        .catch((error) => {
          complete(() => {
            if (controller?.signal.aborted) {
              const reason = controller.signal.reason;
              const timeoutError =
                reason instanceof Error
                  ? reason
                  : new Error(
                      typeof reason === "string" && reason.trim().length > 0
                        ? reason
                        : message,
                    );
              reject(timeoutError);
              return;
            }
            reject(error);
          });
        });
    });
  }
}
