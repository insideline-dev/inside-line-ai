import { Injectable, Logger, Optional } from "@nestjs/common";
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

@Injectable()
export class EvaluationAgentRegistryService {
  private readonly logger = new Logger(EvaluationAgentRegistryService.name);

  private readonly agents: Array<EvaluationAgent<unknown>>;

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
    @Optional() private pipelineAgentTrace?: PipelineAgentTraceService,
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
  }

  async runAll(
    startupId: string,
    pipelineData: EvaluationPipelineInput,
    onAgentStart?: (agent: EvaluationAgentKey) => void,
    onAgentComplete?: (payload: EvaluationAgentCompletion) => void,
    onAgentLifecycle?: (payload: EvaluationAgentLifecycleEvent) => void,
  ): Promise<EvaluationResult> {
    const pipelineRunId = (await this.pipelineState.get(startupId))?.pipelineRunId;
    const traceWrites: Promise<void>[] = [];
    const outputs = new Map<EvaluationAgentKey, unknown>();
    const failedKeys: EvaluationAgentKey[] = [];
    const errors: Array<{ agent: string; error: string }> = [];
    const fallbackKeys: EvaluationAgentKey[] = [];
    const warnings: Array<{ agent: string; message: string }> = [];
    const fallbackReasonCounts: Partial<Record<EvaluationFallbackReason, number>> = {};
    await Promise.all(
      this.agents.map(async (agent) => {
        const startedAt = new Date();
        this.emitAgentStart(onAgentStart, agent.key);

        try {
          const feedbackNotes = await this.loadFeedbackNotes(startupId, agent.key);
          const result = await agent.run(pipelineData, {
            feedbackNotes,
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

          const fallbackOutput = agent.fallback(pipelineData);
          traceWrites.push(
            this.persistAgentTrace(startupId, pipelineRunId, {
              agent: agent.key,
              status: "fallback",
              inputPrompt: "",
              outputText: this.safeStringify(fallbackOutput),
              outputJson: fallbackOutput,
              attempt: 1,
              retryCount: 0,
              usedFallback: true,
              error: errorMessage,
              fallbackReason,
              rawProviderError: errorMessage,
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

    const completedAgents = this.agents.length - failedKeys.length;
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
      degraded: completedAgents < minimumRequired || fallbackAgents > 0,
    };

    if (summary.degraded) {
      this.logger.warn(
        `Evaluation completed in degraded mode for startup ${startupId}: ${completedAgents}/${this.agents.length} completed, ${fallbackAgents} fallback`,
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

  async runOne(
    startupId: string,
    key: EvaluationAgentKey,
    pipelineData: EvaluationPipelineInput,
    onAgentStart?: (agent: EvaluationAgentKey) => void,
    onAgentLifecycle?: (payload: EvaluationAgentLifecycleEvent) => void,
  ): Promise<EvaluationAgentCompletion> {
    const pipelineRunId = (await this.pipelineState.get(startupId))?.pipelineRunId;
    const traceWrites: Promise<void>[] = [];
    const agent = this.agents.find((candidate) => candidate.key === key);
    if (!agent) {
      throw new Error(`Unsupported evaluation agent "${key}"`);
    }

    const startedAt = new Date();
    this.emitAgentStart(onAgentStart, key);
    try {
      const feedbackNotes = await this.loadFeedbackNotes(startupId, key);
      const result = await agent.run(pipelineData, {
        feedbackNotes,
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
      const fallbackOutput = agent.fallback(pipelineData);
      traceWrites.push(
        this.persistAgentTrace(startupId, pipelineRunId, {
          agent: key,
          status: "fallback",
          inputPrompt: "",
          outputText: this.safeStringify(fallbackOutput),
          outputJson: fallbackOutput,
          attempt: 1,
          retryCount: 0,
          usedFallback: true,
          error: message,
          fallbackReason,
          rawProviderError: message,
        }),
      );
      await Promise.allSettled(traceWrites);
      return {
        agent: key,
        output: fallbackOutput,
        usedFallback: true,
        attempt: 1,
        retryCount: 0,
        error: message,
        fallbackReason,
        rawProviderError: message,
      };
    }
  }

  private persistAgentTrace(
    startupId: string,
    pipelineRunId: string | undefined,
    event: EvaluationAgentTraceEvent,
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
        outputText: event.outputText,
        outputJson: event.outputJson,
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
}
