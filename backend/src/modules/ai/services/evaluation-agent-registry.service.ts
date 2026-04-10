import { Inject, Injectable, Logger, Optional, forwardRef } from "@nestjs/common";
import type {
  EvaluationAgent,
  EvaluationAgentCompletion,
  EvaluationFallbackReason,
  EvaluationAgentLifecycleEvent,
  EvaluationFeedbackNote,
  EvaluationAgentKey,
  EvaluationPipelineInput,
  EvaluationAgentTraceEvent,
} from "../interfaces/agent.interface";
import type {
  EvaluationResult,
  EvaluationSummary,
} from "../interfaces/phase-results.interface";
import { PipelinePhase } from "../interfaces/pipeline.interface";
import { PipelineStateService } from "./pipeline-state.service";
import { PhaseTransitionService } from "../orchestrator/phase-transition.service";
import { PipelineFeedbackService } from "./pipeline-feedback.service";
import { PipelineAgentTraceService } from "./pipeline-agent-trace.service";
import {
  BusinessModelEvaluationAgent,
  CompetitiveAdvantageEvaluationAgent,
  DealTermsEvaluationAgent,
  ExitPotentialEvaluationAgent,
  FinancialsEvaluationAgent,
  GtmEvaluationAgent,
  LegalEvaluationAgent,
  MarketEvaluationAgent,
  ProductEvaluationAgent,
  TeamEvaluationAgent,
  TractionEvaluationAgent,
} from "../agents/evaluation";
import { AgentConfigService } from "./agent-config.service";
import { DynamicAgentRunnerService } from "./dynamic-agent-runner.service";
import {
  EvaluationInputResolverService,
  type ResolvedEvaluationInput,
} from "./evaluation-input-resolver.service";
import { AiConfigService } from "./ai-config.service";
import { PipelineFlowConfigService } from "./pipeline-flow-config.service";
import type { PipelineFlowNodeConfigs } from "./pipeline-graph-compiler.service";

type PersistedEvaluationTraceEvent = EvaluationAgentTraceEvent & {
  meta?: Record<string, unknown>;
};

@Injectable()
export class EvaluationAgentRegistryService {
  private readonly logger = new Logger(EvaluationAgentRegistryService.name);

  private readonly agents: Array<EvaluationAgent<unknown>>;
  private readonly builtInAgentsByKey: Record<string, EvaluationAgent<unknown>>;

  constructor(
    private team: TeamEvaluationAgent,
    private market: MarketEvaluationAgent,
    private product: ProductEvaluationAgent,
    private traction: TractionEvaluationAgent,
    private businessModel: BusinessModelEvaluationAgent,
    private gtm: GtmEvaluationAgent,
    private financials: FinancialsEvaluationAgent,
    private competitiveAdvantage: CompetitiveAdvantageEvaluationAgent,
    private legal: LegalEvaluationAgent,
    private dealTerms: DealTermsEvaluationAgent,
    private exitPotential: ExitPotentialEvaluationAgent,
    private pipelineState: PipelineStateService,
    private phaseTransition: PhaseTransitionService,
    private pipelineFeedback: PipelineFeedbackService,
    private agentConfigService: AgentConfigService,
    private dynamicAgentRunner: DynamicAgentRunnerService,
    @Optional() private pipelineAgentTrace?: PipelineAgentTraceService,
    @Optional() private evaluationInputResolver?: EvaluationInputResolverService,
    @Optional() private aiConfig?: AiConfigService,
    @Optional() @Inject(forwardRef(() => PipelineFlowConfigService)) private flowConfigService?: PipelineFlowConfigService,
  ) {
    this.agents = [
      this.team,
      this.market,
      this.product,
      this.traction,
      this.businessModel,
      this.gtm,
      this.financials,
      this.competitiveAdvantage,
      this.legal,
      this.dealTerms,
      this.exitPotential,
    ];
    this.builtInAgentsByKey = Object.fromEntries(
      this.agents.map((agent) => [agent.key, agent]),
    );
  }

  async runAll(
    startupId: string,
    pipelineData: EvaluationPipelineInput,
    onAgentStart?: (agent: EvaluationAgentKey) => void,
    onAgentComplete?: (payload: EvaluationAgentCompletion) => void,
    onAgentLifecycle?: (payload: EvaluationAgentLifecycleEvent) => void,
    agentDocumentMap?: Map<EvaluationAgentKey, string[]>,
  ): Promise<EvaluationResult> {
    const resolvedAgents = await this.resolveAgents();
    const pipelineRunId = (await this.pipelineState.get(startupId))?.pipelineRunId;
    const traceWrites: Promise<void>[] = [];
    const outputs = new Map<EvaluationAgentKey, unknown>();
    const failedKeys: EvaluationAgentKey[] = [];
    const errors: Array<{ agent: string; error: string }> = [];
    const fallbackKeys: EvaluationAgentKey[] = [];
    const warnings: Array<{ agent: string; message: string }> = [];
    const fallbackReasonCounts: Partial<Record<EvaluationFallbackReason, number>> = {};
    const nodeConfigs = await this.loadNodeConfigs();
    const getEvalAgentConfig = (agentKey: string) => {
      const config = nodeConfigs?.[`evaluation_${agentKey}`];
      if (typeof config !== 'object' || config === null) return { webSearchEnabled: false, braveSearchEnabled: false };
      const c = config as { webSearchEnabled?: boolean; braveSearchEnabled?: boolean };
      return { webSearchEnabled: c.webSearchEnabled === true, braveSearchEnabled: c.braveSearchEnabled === true };
    };

    const evaluationAgentStaggerMs = Math.max(
      0,
      this.aiConfig?.getEvaluationAgentStaggerMs() ?? 0,
    );
    await Promise.all(
      resolvedAgents.map(async (agent, index) => {
        const startDelayMs = index * evaluationAgentStaggerMs;
        if (startDelayMs > 0) {
          await this.sleep(startDelayMs);
        }
        const resolvedInput = await this.resolvePipelineInputForAgent(
          agent.key,
          pipelineData,
          agentDocumentMap,
        );
        const dataSummary = this.buildInputDataSummary(resolvedInput);
        const startedAt = new Date();
        this.emitAgentStart(onAgentStart, agent.key);

        try {
          const feedbackNotes = await this.loadFeedbackNotes(startupId, agent.key);
          const result = await agent.run(resolvedInput.pipelineData, {
            feedbackNotes,
            ...getEvalAgentConfig(agent.key),
            onLifecycle: (event) =>
              this.emitAgentLifecycle(onAgentLifecycle, event),
            onTrace: (event) => {
              traceWrites.push(
                this.persistAgentTrace(startupId, pipelineRunId, event),
              );
            },
          });
          const completedAt = new Date();

          await this.recordTelemetrySafely(startupId, {
            agentKey: result.key,
            phase: PipelinePhase.EVALUATION,
            startedAt: startedAt.toISOString(),
            completedAt: completedAt.toISOString(),
            durationMs: completedAt.getTime() - startedAt.getTime(),
            retryCount: result.retryCount ?? 0,
          });

          if (!result.usedFallback) {
            await this.consumeAgentFeedback(startupId, agent.key);
          }

          outputs.set(result.key, result.output);
          const normalizedFallbackReason = result.usedFallback
            ? (result.fallbackReason ?? "UNHANDLED_AGENT_EXCEPTION")
            : result.fallbackReason;
          this.emitAgentCompletion(onAgentComplete, {
            agent: result.key,
            output: result.output,
            usedFallback: result.usedFallback,
            ...(dataSummary ? { dataSummary } : {}),
            ...(typeof result.attempt === "number"
              ? { attempt: result.attempt }
              : {}),
            ...(typeof result.retryCount === "number"
              ? { retryCount: result.retryCount }
              : {}),
            error: result.error,
            fallbackReason: normalizedFallbackReason,
            rawProviderError: result.rawProviderError,
          });

          if (result.usedFallback) {
            fallbackKeys.push(result.key);
            warnings.push({
              agent: result.key,
              message:
                result.error ??
                "Agent returned deterministic fallback output; manual review recommended.",
              ...(normalizedFallbackReason
                ? { reason: normalizedFallbackReason }
                : {}),
            });
            this.bumpFallbackReasonCount(
              fallbackReasonCounts,
              normalizedFallbackReason,
            );
          }
        } catch (error) {
          const completedAt = new Date();
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          const fallbackReason: EvaluationFallbackReason =
            "UNHANDLED_AGENT_EXCEPTION";

          this.emitAgentLifecycle(onAgentLifecycle, {
            agent: agent.key,
            event: "fallback",
            attempt: 1,
            retryCount: 0,
            error: errorMessage,
            fallbackReason,
            rawProviderError: errorMessage,
          });

          await this.recordTelemetrySafely(startupId, {
            agentKey: agent.key,
            phase: PipelinePhase.EVALUATION,
            startedAt: startedAt.toISOString(),
            completedAt: completedAt.toISOString(),
            durationMs: completedAt.getTime() - startedAt.getTime(),
            retryCount: 0,
          });

          const fallbackOutput = agent.fallback(resolvedInput.pipelineData);
          traceWrites.push(
            this.persistAgentTrace(startupId, pipelineRunId, {
              agent: agent.key,
              status: "fallback",
              inputPrompt: "",
              systemPrompt: "",
              outputText: this.safeStringify(fallbackOutput),
              outputJson: fallbackOutput,
              attempt: 1,
              retryCount: 0,
              usedFallback: true,
              error: errorMessage,
              fallbackReason,
              rawProviderError: errorMessage,
              meta: this.buildUnhandledErrorMeta(error),
            }),
          );

          fallbackKeys.push(agent.key);
          warnings.push({
            agent: agent.key,
            message: errorMessage,
            ...(fallbackReason ? { reason: fallbackReason } : {}),
          });
          this.bumpFallbackReasonCount(
            fallbackReasonCounts,
            fallbackReason,
          );
          outputs.set(agent.key, fallbackOutput);
          this.emitAgentCompletion(onAgentComplete, {
            agent: agent.key,
            output: fallbackOutput,
            usedFallback: true,
            ...(dataSummary ? { dataSummary } : {}),
            attempt: 1,
            retryCount: 0,
            error: errorMessage,
            fallbackReason,
            rawProviderError: errorMessage,
          });
        }
      }),
    );
    await Promise.allSettled(traceWrites);

    for (const agent of this.agents) {
      if (!outputs.has(agent.key)) {
        this.logger.error(
          `Evaluation agent "${agent.key}" produced no output for startup ${startupId} — generating fallback`,
        );
        outputs.set(agent.key, agent.fallback(pipelineData));
        failedKeys.push(agent.key);
        errors.push({ agent: agent.key, error: "Agent produced no output; fallback generated post-hoc" });
      }
    }

    const completedAgents = resolvedAgents.length - failedKeys.length;
    const minimumRequired = this.phaseTransition.getConfig().minimumEvaluationAgents;
    const fallbackAgents = fallbackKeys.length;
    const summary: EvaluationSummary = {
      completedAgents,
      failedAgents: failedKeys.length,
      minimumRequired,
      failedKeys,
      errors,
      fallbackAgents,
      fallbackKeys,
      warnings,
      fallbackReasonCounts,
      degraded: completedAgents < minimumRequired || fallbackAgents > 3,
    };

    if (summary.degraded) {
      this.logger.warn(
          `Evaluation completed in degraded mode for startup ${startupId}: ${completedAgents}/${resolvedAgents.length} completed, ${fallbackAgents} fallback`,
        );
    }

    return {
      team: outputs.get("team") as EvaluationResult["team"],
      market: outputs.get("market") as EvaluationResult["market"],
      product: outputs.get("product") as EvaluationResult["product"],
      traction: outputs.get("traction") as EvaluationResult["traction"],
      businessModel: outputs.get("businessModel") as EvaluationResult["businessModel"],
      gtm: outputs.get("gtm") as EvaluationResult["gtm"],
      financials: outputs.get("financials") as EvaluationResult["financials"],
      competitiveAdvantage: outputs.get("competitiveAdvantage") as EvaluationResult["competitiveAdvantage"],
      legal: outputs.get("legal") as EvaluationResult["legal"],
      dealTerms: outputs.get("dealTerms") as EvaluationResult["dealTerms"],
      exitPotential: outputs.get("exitPotential") as EvaluationResult["exitPotential"],
      summary,
    };
  }

  private async sleep(ms: number): Promise<void> {
    if (ms <= 0) {
      return;
    }
    await new Promise<void>((resolve) => setTimeout(resolve, ms));
  }

  async runOne(
    startupId: string,
    key: EvaluationAgentKey,
    pipelineData: EvaluationPipelineInput,
    onAgentStart?: (agent: EvaluationAgentKey) => void,
    onAgentLifecycle?: (payload: EvaluationAgentLifecycleEvent) => void,
    agentDocumentMap?: Map<EvaluationAgentKey, string[]>,
  ): Promise<EvaluationAgentCompletion> {
    const resolvedAgents = await this.resolveAgents();
    const pipelineRunId = (await this.pipelineState.get(startupId))?.pipelineRunId;
    const traceWrites: Promise<void>[] = [];
    const agent = resolvedAgents.find((candidate) => candidate.key === key);
    if (!agent) {
      throw new Error(`Unsupported evaluation agent "${key}"`);
    }

    const nodeConfigs = await this.loadNodeConfigs();
    const getEvalAgentConfig = (agentKey: string) => {
      const config = nodeConfigs?.[`evaluation_${agentKey}`];
      if (typeof config !== 'object' || config === null) return { webSearchEnabled: false, braveSearchEnabled: false };
      const c = config as { webSearchEnabled?: boolean; braveSearchEnabled?: boolean };
      return { webSearchEnabled: c.webSearchEnabled === true, braveSearchEnabled: c.braveSearchEnabled === true };
    };

    const startedAt = new Date();
    this.emitAgentStart(onAgentStart, key);
    const resolvedInput = await this.resolvePipelineInputForAgent(
      key,
      pipelineData,
      agentDocumentMap,
    );
    const dataSummary = this.buildInputDataSummary(resolvedInput);
    try {
      const feedbackNotes = await this.loadFeedbackNotes(startupId, key);
      const result = await agent.run(resolvedInput.pipelineData, {
        feedbackNotes,
        ...getEvalAgentConfig(key),
        onLifecycle: (event) =>
          this.emitAgentLifecycle(onAgentLifecycle, event),
        onTrace: (event) => {
          traceWrites.push(
            this.persistAgentTrace(startupId, pipelineRunId, event),
          );
        },
      });
      const completedAt = new Date();

      await this.recordTelemetrySafely(startupId, {
        agentKey: result.key,
        phase: PipelinePhase.EVALUATION,
        startedAt: startedAt.toISOString(),
        completedAt: completedAt.toISOString(),
        durationMs: completedAt.getTime() - startedAt.getTime(),
        retryCount: result.retryCount ?? 0,
      });

      if (!result.usedFallback) {
        await this.consumeAgentFeedback(startupId, key);
        await this.consumePhaseFeedback(startupId);
      }
      await Promise.allSettled(traceWrites);

      return {
        agent: result.key,
        output: result.output,
        usedFallback: result.usedFallback,
        ...(dataSummary ? { dataSummary } : {}),
        ...(typeof result.attempt === "number"
          ? { attempt: result.attempt }
          : {}),
        ...(typeof result.retryCount === "number"
          ? { retryCount: result.retryCount }
          : {}),
        error: result.error,
        fallbackReason: result.usedFallback
          ? (result.fallbackReason ?? "UNHANDLED_AGENT_EXCEPTION")
          : result.fallbackReason,
        rawProviderError: result.rawProviderError,
      };
    } catch (error) {
      const completedAt = new Date();
      const message = error instanceof Error ? error.message : String(error);
      const fallbackReason: EvaluationFallbackReason =
        "UNHANDLED_AGENT_EXCEPTION";
      this.emitAgentLifecycle(onAgentLifecycle, {
        agent: key,
        event: "fallback",
        attempt: 1,
        retryCount: 0,
        error: message,
        fallbackReason,
        rawProviderError: message,
      });
      await this.recordTelemetrySafely(startupId, {
        agentKey: key,
        phase: PipelinePhase.EVALUATION,
        startedAt: startedAt.toISOString(),
        completedAt: completedAt.toISOString(),
        durationMs: completedAt.getTime() - startedAt.getTime(),
        retryCount: 0,
      });
      const fallbackOutput = agent.fallback(resolvedInput.pipelineData);
      traceWrites.push(
        this.persistAgentTrace(startupId, pipelineRunId, {
          agent: key,
          status: "fallback",
          inputPrompt: "",
          systemPrompt: "",
          outputText: this.safeStringify(fallbackOutput),
          outputJson: fallbackOutput,
          attempt: 1,
          retryCount: 0,
          usedFallback: true,
          error: message,
          fallbackReason,
          rawProviderError: message,
          meta: this.buildUnhandledErrorMeta(error),
        }),
      );
      await Promise.allSettled(traceWrites);
      return {
        agent: key,
        output: fallbackOutput,
        usedFallback: true,
        ...(dataSummary ? { dataSummary } : {}),
        attempt: 1,
        retryCount: 0,
        error: message,
        fallbackReason,
        rawProviderError: message,
      };
    }
  }

  private async resolveAgents(): Promise<Array<EvaluationAgent<unknown>>> {
    const configs = await this.agentConfigService.getExecutableByOrchestrator(
      "evaluation_orchestrator",
      "pipeline",
    );

    if (configs.length === 0) {
      return this.agents;
    }

    const resolved: Array<EvaluationAgent<unknown>> = [];

    for (const entry of configs) {
      const { config, promptKey } = entry;

      if (!config.isCustom) {
        const builtIn = this.builtInAgentsByKey[config.agentKey];
        if (builtIn) {
          resolved.push(builtIn);
        }
        continue;
      }

      if (!promptKey) {
        continue;
      }

      resolved.push({
        key: config.agentKey as EvaluationAgentKey,
        run: async (pipelineData, options) => {
          const result = await this.dynamicAgentRunner.run({
            agentKey: config.agentKey,
            promptKey,
            pipelineData,
            stage: pipelineData.extraction.stage as never,
          });
          options?.onTrace?.({
            agent: config.agentKey as EvaluationAgentKey,
            status: result.usedFallback ? "fallback" : "completed",
            inputPrompt: result.inputPrompt,
            systemPrompt: result.systemPrompt,
            outputText: result.outputText,
            outputJson: result.output,
            attempt: result.attempt,
            retryCount: result.retryCount,
            usedFallback: result.usedFallback,
            error: result.error,
            fallbackReason: result.usedFallback
              ? "UNHANDLED_AGENT_EXCEPTION"
              : undefined,
            rawProviderError: result.error,
          });
          return {
            key: result.key as EvaluationAgentKey,
            output: result.output,
            usedFallback: result.usedFallback,
            error: result.error,
            attempt: result.attempt,
            retryCount: result.retryCount,
            fallbackReason: result.usedFallback
              ? "UNHANDLED_AGENT_EXCEPTION"
              : undefined,
            rawProviderError: result.error,
          };
        },
        fallback: () => ({}),
      });
    }

    return resolved.length > 0 ? resolved : this.agents;
  }

  private persistAgentTrace(
    startupId: string,
    pipelineRunId: string | undefined,
    event: PersistedEvaluationTraceEvent,
  ): Promise<void> {
    if (!pipelineRunId) {
      return Promise.resolve();
    }
    if (!this.pipelineAgentTrace) {
      return Promise.resolve();
    }

    return this.pipelineAgentTrace
      .recordRun({
        startupId,
        pipelineRunId,
        phase: PipelinePhase.EVALUATION,
        agentKey: event.agent,
        status: event.status,
        attempt: event.attempt,
        retryCount: event.retryCount,
        usedFallback: event.usedFallback,
        inputPrompt: event.inputPrompt,
        systemPrompt: event.systemPrompt,
        outputText: event.outputText,
        outputJson: event.outputJson,
        meta: event.meta,
        error: event.error,
        fallbackReason: event.fallbackReason,
        rawProviderError: event.rawProviderError,
      })
      .catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(
          `Failed to persist evaluation trace for ${event.agent}: ${message}`,
        );
      });
  }

  private buildUnhandledErrorMeta(error: unknown): Record<string, unknown> {
    const message = error instanceof Error ? error.message : String(error);
    const name = error instanceof Error ? error.name : "UnhandledError";
    const stack =
      error instanceof Error && typeof error.stack === "string"
        ? error.stack.slice(0, 8_000)
        : undefined;

    return {
      errorDetail: {
        name,
        message,
        ...(stack ? { stack } : {}),
      },
    };
  }

  private safeStringify(value: unknown): string {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }

  private bumpFallbackReasonCount(
    counts: Partial<Record<EvaluationFallbackReason, number>>,
    reason: EvaluationFallbackReason | undefined,
  ): void {
    if (!reason) {
      return;
    }
    counts[reason] = (counts[reason] ?? 0) + 1;
  }

  private async recordTelemetrySafely(
    startupId: string,
    payload: Parameters<PipelineStateService["recordAgentTelemetry"]>[1],
  ): Promise<void> {
    try {
      await this.pipelineState.recordAgentTelemetry(startupId, payload);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Failed to record evaluation telemetry for ${payload.agentKey}: ${message}`,
      );
    }
  }

  private emitAgentStart(
    onAgentStart: ((agent: EvaluationAgentKey) => void) | undefined,
    agent: EvaluationAgentKey,
  ): void {
    if (!onAgentStart) {
      return;
    }

    try {
      onAgentStart(agent);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Evaluation agent start callback failed for ${agent}: ${message}`,
      );
    }
  }

  private emitAgentCompletion(
    onAgentComplete: ((payload: EvaluationAgentCompletion) => void) | undefined,
    payload: EvaluationAgentCompletion,
  ): void {
    if (!onAgentComplete) {
      return;
    }

    try {
      onAgentComplete(payload);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Evaluation agent completion callback failed for ${payload.agent}: ${message}`,
      );
    }
  }

  private emitAgentLifecycle(
    onAgentLifecycle:
      | ((payload: EvaluationAgentLifecycleEvent) => void)
      | undefined,
    payload: EvaluationAgentLifecycleEvent,
  ): void {
    if (!onAgentLifecycle) {
      return;
    }

    try {
      onAgentLifecycle(payload);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Evaluation agent lifecycle callback failed for ${payload.agent}: ${message}`,
      );
    }
  }

  private async loadFeedbackNotes(
    startupId: string,
    key: EvaluationAgentKey,
  ): Promise<EvaluationFeedbackNote[]> {
    const [phaseScope, agentScope] = await Promise.all([
      this.pipelineFeedback.getContext({
        startupId,
        phase: PipelinePhase.EVALUATION,
        limit: 10,
      }),
      this.pipelineFeedback.getContext({
        startupId,
        phase: PipelinePhase.EVALUATION,
        agentKey: key,
        limit: 10,
      }),
    ]);

    const byId = new Map<string, EvaluationFeedbackNote>();
    for (const item of phaseScope.items) {
      if (item.agentKey !== null) {
        continue;
      }
      byId.set(item.id, {
        scope: "phase",
        feedback: item.feedback,
        createdAt: item.createdAt,
      });
    }
    for (const item of agentScope.items) {
      byId.set(item.id, {
        scope: item.agentKey ? `agent:${key}` : "phase",
        feedback: item.feedback,
        createdAt: item.createdAt,
      });
    }

    return Array.from(byId.values())
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, 10);
  }

  private async consumeAgentFeedback(
    startupId: string,
    key: EvaluationAgentKey,
  ): Promise<void> {
    try {
      await this.pipelineFeedback.markConsumedByScope({
        startupId,
        phase: PipelinePhase.EVALUATION,
        agentKey: key,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Failed to mark evaluation feedback consumed for ${key}: ${message}`,
      );
    }
  }

  private async consumePhaseFeedback(startupId: string): Promise<void> {
    try {
      await this.pipelineFeedback.markConsumedByScope({
        startupId,
        phase: PipelinePhase.EVALUATION,
        agentKey: null,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Failed to mark phase-level evaluation feedback consumed: ${message}`,
      );
    }
  }

  private async resolvePipelineInputForAgent(
    agentKey: EvaluationAgentKey,
    pipelineData: EvaluationPipelineInput,
    agentDocumentMap?: Map<EvaluationAgentKey, string[]>,
  ): Promise<ResolvedEvaluationInput> {
    const relevantDocs = agentDocumentMap?.get(agentKey);
    const relevantSupportingDocuments = relevantDocs && relevantDocs.length > 0
      ? `Relevant classified documents for this evaluation:\n${relevantDocs.join("\n")}`
      : undefined;

    if (!this.evaluationInputResolver) {
      return {
        pipelineData: {
          ...pipelineData,
          relevantSupportingDocuments,
          mappedInputs: { researchReportText: pipelineData.research.combinedReportText ?? "" },
          mappedInputSources: [],
          edgeDrivenInputFallbackUsed: false,
        },
        mappedInputs: { researchReportText: pipelineData.research.combinedReportText ?? "" },
        sources: [],
        fallbackUsed: false,
        reason: "resolver_unavailable",
      };
    }

    try {
      const resolved = await this.evaluationInputResolver.resolveForAgent(
        agentKey,
        pipelineData,
      );
      if (relevantSupportingDocuments) {
        resolved.pipelineData.relevantSupportingDocuments = relevantSupportingDocuments;
      }
      return resolved;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Failed to resolve edge-driven evaluation inputs for ${agentKey}: ${message}`,
      );
      return {
        pipelineData: {
          ...pipelineData,
          relevantSupportingDocuments,
          mappedInputs: { researchReportText: pipelineData.research.combinedReportText ?? "" },
          mappedInputSources: [],
          edgeDrivenInputFallbackUsed: true,
        },
        mappedInputs: { researchReportText: pipelineData.research.combinedReportText ?? "" },
        sources: [],
        fallbackUsed: true,
        reason: "resolver_error",
      };
    }
  }

  private async loadNodeConfigs(): Promise<PipelineFlowNodeConfigs | undefined> {
    try {
      const result = await this.flowConfigService?.getPublishedParsedFlowDefinition();
      return result?.flowDefinition?.nodeConfigs ?? undefined;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Failed to load flow node configs: ${message}`);
      return undefined;
    }
  }

  private buildInputDataSummary(
    resolvedInput: ResolvedEvaluationInput,
  ): Record<string, unknown> | undefined {
    const linkedResearchAgents = Array.from(
      new Set(resolvedInput.sources.map((source) => source.researchAgentId)),
    );
    if (
      linkedResearchAgents.length === 0 &&
      !resolvedInput.fallbackUsed &&
      Object.keys(resolvedInput.mappedInputs).length === 0
    ) {
      return undefined;
    }

    return {
      edgeDrivenInputFallbackUsed: resolvedInput.fallbackUsed,
      mappedSourceCount: resolvedInput.sources.length,
      linkedResearchAgents,
      ...(resolvedInput.reason ? { mappingFallbackReason: resolvedInput.reason } : {}),
    };
  }
}
