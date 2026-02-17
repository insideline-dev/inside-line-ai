import { Injectable, Optional } from "@nestjs/common";
import { EvaluationAgentRegistryService } from "./evaluation-agent-registry.service";
import { PipelineStateService } from "./pipeline-state.service";
import { ModelPurpose, PipelinePhase } from "../interfaces/pipeline.interface";
import type {
  EvaluationAgentCompletion,
  EvaluationAgentKey,
  EvaluationPipelineInput,
} from "../interfaces/agent.interface";
import type { EvaluationResult } from "../interfaces/phase-results.interface";
import { EVALUATION_SCHEMAS } from "../schemas";
import { EVALUATION_AGENT_KEYS } from "../constants/agent-keys";
import { AiDebugLogService } from "./ai-debug-log.service";
import { DEFAULT_MODEL_BY_PURPOSE } from "../ai.config";

export interface EvaluationRunOptions {
  onAgentComplete?: (payload: EvaluationAgentCompletion) => void;
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
          handleAgentComplete,
        );
      }

      const rerun = await this.registry.runOne(
        startupId,
        options.agentKey,
        pipelineInput,
      );
      handleAgentComplete(rerun);

      return this.mergeAgentResult(current, rerun);
    }

    return this.registry.runAll(startupId, pipelineInput, handleAgentComplete);
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

    return { extraction, scraping, research };
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
      },
    };

    next.summary.errors = next.summary.errors.filter(
      (entry) => entry.agent !== rerun.agent,
    );

    const schema = EVALUATION_SCHEMAS[rerun.agent];
    const parsed = schema.safeParse(rerun.output);
    (next as unknown as Record<string, unknown>)[rerun.agent] = parsed.success
      ? parsed.data
      : rerun.output;

    const failed = new Set(next.summary.failedKeys);
    if (rerun.usedFallback) {
      failed.add(rerun.agent);
      next.summary.errors.push({
        agent: rerun.agent,
        error: rerun.error ?? "Agent fallback used",
      });
    } else {
      failed.delete(rerun.agent);
    }

    next.summary.failedKeys = EVALUATION_AGENT_KEYS.filter((key) =>
      failed.has(key),
    );
    next.summary.failedAgents = next.summary.failedKeys.length;
    next.summary.completedAgents =
      EVALUATION_AGENT_KEYS.length - next.summary.failedAgents;
    next.summary.degraded =
      next.summary.completedAgents < next.summary.minimumRequired;

    return next;
  }
}
