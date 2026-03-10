import { Injectable, Optional } from "@nestjs/common";
import { EvaluationAgentRegistryService } from "./evaluation-agent-registry.service";
import { PipelineStateService } from "./pipeline-state.service";
import { ModelPurpose, PipelinePhase } from "../interfaces/pipeline.interface";
import type {
  EvaluationAgentCompletion,
  EvaluationFallbackReason,
  EvaluationAgentLifecycleEvent,
  EvaluationAgentKey,
  EvaluationPipelineInput,
} from "../interfaces/agent.interface";
import type { EvaluationResult } from "../interfaces/phase-results.interface";
import { EVALUATION_SCHEMAS } from "../schemas";
import { EVALUATION_AGENT_KEYS } from "../constants/agent-keys";
import { AiDebugLogService } from "./ai-debug-log.service";
import { DEFAULT_MODEL_BY_PURPOSE } from "../ai.config";
import { normalizeResearchResult } from "./research-result-normalizer";

export interface EvaluationRunOptions {
  onAgentStart?: (agent: EvaluationAgentKey) => void;
  onAgentComplete?: (payload: EvaluationAgentCompletion) => void;
  onAgentLifecycle?: (payload: EvaluationAgentLifecycleEvent) => void;
  agentKey?: EvaluationAgentKey;
}

@Injectable()
export class EvaluationService {
  constructor(
    private pipelineState: PipelineStateService,
    private registry: EvaluationAgentRegistryService,
    @Optional() private aiDebugLog?: AiDebugLogService,
  ) {}

  async run(
    startupId: string,
    options?: EvaluationRunOptions,
  ): Promise<EvaluationResult> {
    const evaluationModel =
      process.env.AI_MODEL_EVALUATION ??
      DEFAULT_MODEL_BY_PURPOSE[ModelPurpose.EVALUATION];

    const handleAgentStart = (agent: EvaluationAgentKey) => {
      options?.onAgentStart?.(agent);
    };

    const handleAgentComplete = (payload: EvaluationAgentCompletion) => {
      void this.aiDebugLog?.logAgentResult({
        startupId,
        phase: PipelinePhase.EVALUATION,
        agentKey: payload.agent,
        usedFallback: payload.usedFallback,
        error: payload.error,
        model: evaluationModel,
        output: payload.output,
      });

      options?.onAgentComplete?.(payload);
    };

    const handleAgentLifecycle = (payload: EvaluationAgentLifecycleEvent) => {
      options?.onAgentLifecycle?.(payload);
    };

    const pipelineInput = await this.loadPipelineInput(startupId);
    if (options?.agentKey) {
      const current = await this.pipelineState.getPhaseResult(
        startupId,
        PipelinePhase.EVALUATION,
      );

      if (!current) {
        return this.registry.runAll(
          startupId,
          pipelineInput,
          handleAgentStart,
          handleAgentComplete,
          handleAgentLifecycle,
        );
      }

      const rerun = await this.registry.runOne(
        startupId,
        options.agentKey,
        pipelineInput,
        handleAgentStart,
        handleAgentLifecycle,
      );
      handleAgentComplete(rerun);

      return this.mergeAgentResult(current, rerun);
    }

    return this.registry.runAll(
      startupId,
      pipelineInput,
      handleAgentStart,
      handleAgentComplete,
      handleAgentLifecycle,
    );
  }

  private async loadPipelineInput(startupId: string): Promise<EvaluationPipelineInput> {
    const extraction = await this.pipelineState.getPhaseResult(
      startupId,
      PipelinePhase.EXTRACTION,
    );
    const scraping = await this.pipelineState.getPhaseResult(
      startupId,
      PipelinePhase.SCRAPING,
    );
    const research = await this.pipelineState.getPhaseResult(
      startupId,
      PipelinePhase.RESEARCH,
    );

    if (!extraction || !scraping || !research) {
      throw new Error(
        "Evaluation requires extraction, scraping, and research results",
      );
    }

    const { result: normalizedResearch } = normalizeResearchResult(research);
    return { extraction, scraping, research: normalizedResearch };
  }

  private mergeAgentResult(
    current: EvaluationResult,
    rerun: EvaluationAgentCompletion,
  ): EvaluationResult {
    const next: EvaluationResult = {
      ...current,
      summary: {
        ...current.summary,
        failedKeys: [...current.summary.failedKeys],
        errors: [...current.summary.errors],
        fallbackKeys: [...(current.summary.fallbackKeys ?? [])],
        warnings: [...(current.summary.warnings ?? [])],
        fallbackReasonCounts: { ...(current.summary.fallbackReasonCounts ?? {}) },
      },
    };

    const previousWarning = (next.summary.warnings ?? []).find(
      (entry) => entry.agent === rerun.agent,
    );
    this.updateFallbackReasonCount(
      next.summary.fallbackReasonCounts,
      previousWarning?.reason,
      -1,
    );
    next.summary.errors = next.summary.errors.filter(
      (entry) => entry.agent !== rerun.agent,
    );
    next.summary.warnings = (next.summary.warnings ?? []).filter(
      (entry) => entry.agent !== rerun.agent,
    );

    const schema = EVALUATION_SCHEMAS[rerun.agent];
    const parsed = schema.safeParse(rerun.output);
    (next as unknown as Record<string, unknown>)[rerun.agent] = parsed.success
      ? parsed.data
      : rerun.output;

    const failed = new Set(next.summary.failedKeys);
    const fallback = new Set(next.summary.fallbackKeys ?? []);
    const rerunFallbackReason = rerun.usedFallback
      ? (rerun.fallbackReason ?? "UNHANDLED_AGENT_EXCEPTION")
      : rerun.fallbackReason;
    if (rerun.usedFallback) {
      failed.delete(rerun.agent);
      fallback.add(rerun.agent);
      next.summary.warnings?.push({
        agent: rerun.agent,
        message:
          rerun.error ??
          "Agent returned deterministic fallback output; manual review recommended.",
        ...(rerunFallbackReason ? { reason: rerunFallbackReason } : {}),
      });
      this.updateFallbackReasonCount(
        next.summary.fallbackReasonCounts,
        rerunFallbackReason,
        1,
      );
    } else {
      failed.delete(rerun.agent);
      fallback.delete(rerun.agent);
      if (rerun.error) {
        failed.add(rerun.agent);
        next.summary.errors.push({
          agent: rerun.agent,
          error: rerun.error,
        });
      }
    }

    next.summary.failedKeys = EVALUATION_AGENT_KEYS.filter((key) =>
      failed.has(key),
    );
    next.summary.fallbackKeys = EVALUATION_AGENT_KEYS.filter((key) =>
      fallback.has(key),
    );
    next.summary.failedAgents = next.summary.failedKeys.length;
    next.summary.fallbackAgents = next.summary.fallbackKeys.length;
    next.summary.completedAgents =
      EVALUATION_AGENT_KEYS.length - next.summary.failedAgents;
    next.summary.degraded =
      next.summary.completedAgents < next.summary.minimumRequired ||
      (next.summary.fallbackAgents ?? 0) > 3;

    return next;
  }

  private updateFallbackReasonCount(
    counts: Record<string, number> | undefined,
    reason: EvaluationFallbackReason | undefined,
    delta: number,
  ): void {
    if (!counts || !reason || delta === 0) {
      return;
    }
    const current = counts[reason] ?? 0;
    const next = current + delta;
    if (next <= 0) {
      delete counts[reason];
      return;
    }
    counts[reason] = next;
  }
}
