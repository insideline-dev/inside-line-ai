import { Injectable } from "@nestjs/common";
import { EvaluationAgentRegistryService } from "./evaluation-agent-registry.service";
import { PipelineStateService } from "./pipeline-state.service";
import { PipelinePhase } from "../interfaces/pipeline.interface";
import type { EvaluationAgentCompletion } from "../interfaces/agent.interface";
import type { EvaluationResult } from "../interfaces/phase-results.interface";

export interface EvaluationRunOptions {
  onAgentComplete?: (payload: EvaluationAgentCompletion) => void;
}

@Injectable()
export class EvaluationService {
  constructor(
    private pipelineState: PipelineStateService,
    private registry: EvaluationAgentRegistryService,
  ) {}

  async run(
    startupId: string,
    options?: EvaluationRunOptions,
  ): Promise<EvaluationResult> {
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

    return this.registry.runAll(
      startupId,
      {
        extraction,
        scraping,
        research,
      },
      options?.onAgentComplete,
    );
  }
}
