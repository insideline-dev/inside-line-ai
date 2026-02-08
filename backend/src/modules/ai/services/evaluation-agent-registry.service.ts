import { Injectable, Logger } from "@nestjs/common";
import type {
  EvaluationAgent,
  EvaluationAgentCompletion,
  EvaluationAgentKey,
  EvaluationPipelineInput,
} from "../interfaces/agent.interface";
import type {
  EvaluationResult,
  EvaluationSummary,
} from "../interfaces/phase-results.interface";
import { PipelinePhase } from "../interfaces/pipeline.interface";
import { PipelineStateService } from "./pipeline-state.service";
import { PhaseTransitionService } from "../orchestrator/phase-transition.service";
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
    onAgentComplete?: (payload: EvaluationAgentCompletion) => void,
  ): Promise<EvaluationResult> {
    const outputs = new Map<EvaluationAgentKey, unknown>();
    const failedKeys: EvaluationAgentKey[] = [];
    const errors: Array<{ agent: string; error: string }> = [];
    const startedAtByAgent = new Map<EvaluationAgentKey, Date>();

    const settled = await Promise.allSettled(
      this.agents.map(async (agent) => {
        const startedAt = new Date();
        startedAtByAgent.set(agent.key, startedAt);
        const result = await agent.run(pipelineData);
        const completedAt = new Date();

        await this.recordTelemetrySafely(startupId, {
          agentKey: result.key,
          phase: PipelinePhase.EVALUATION,
          startedAt: startedAt.toISOString(),
          completedAt: completedAt.toISOString(),
          durationMs: completedAt.getTime() - startedAt.getTime(),
          retryCount: 0,
        });

        return result;
      }),
    );

    settled.forEach((entry, index) => {
      const agent = this.agents[index];

      if (entry.status === "rejected") {
        const startedAt = startedAtByAgent.get(agent.key) ?? new Date();
        const completedAt = new Date();
        const errorMessage =
          entry.reason instanceof Error ? entry.reason.message : String(entry.reason);

        void this.recordTelemetrySafely(startupId, {
          agentKey: agent.key,
          phase: PipelinePhase.EVALUATION,
          startedAt: startedAt.toISOString(),
          completedAt: completedAt.toISOString(),
          durationMs: completedAt.getTime() - startedAt.getTime(),
          retryCount: 0,
        });

        const fallbackOutput = agent.fallback(pipelineData);
        failedKeys.push(agent.key);
        errors.push({
          agent: agent.key,
          error: errorMessage,
        });
        outputs.set(agent.key, fallbackOutput);
        this.emitAgentCompletion(onAgentComplete, {
          agent: agent.key,
          output: fallbackOutput,
          usedFallback: true,
          error: errorMessage,
        });
        return;
      }

      outputs.set(entry.value.key, entry.value.output);
      this.emitAgentCompletion(onAgentComplete, {
        agent: entry.value.key,
        output: entry.value.output,
        usedFallback: entry.value.usedFallback,
        error: entry.value.error,
      });
      if (entry.value.usedFallback) {
        failedKeys.push(entry.value.key);
        errors.push({
          agent: entry.value.key,
          error: entry.value.error ?? "Agent fallback used",
        });
      }
    });

    const completedAgents = this.agents.length - failedKeys.length;
    const minimumRequired = this.phaseTransition.getConfig().minimumEvaluationAgents;
    const summary: EvaluationSummary = {
      completedAgents,
      failedAgents: failedKeys.length,
      minimumRequired,
      failedKeys,
      errors,
      degraded: completedAgents < minimumRequired,
    };

    if (summary.degraded) {
      this.logger.warn(
        `Evaluation completed in degraded mode for startup ${startupId}: ${completedAgents}/${this.agents.length} agents successful`,
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
}
