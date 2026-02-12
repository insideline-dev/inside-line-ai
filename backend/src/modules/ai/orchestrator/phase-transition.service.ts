import { Injectable } from "@nestjs/common";
import {
  PhaseStatus,
  PipelinePhase,
  PipelineState,
} from "../interfaces/pipeline.interface";
import {
  DEFAULT_PIPELINE_CONFIG,
  PhaseConfig,
  PipelineConfig,
  getPhaseConfig,
  isPhaseTerminal,
  validatePipelineConfig,
} from "./pipeline.config";

export interface TransitionDecision {
  queue: PipelinePhase[];
  blockedByRequiredFailure: boolean;
  pipelineComplete: boolean;
  degraded: boolean;
}

@Injectable()
export class PhaseTransitionService {
  private readonly config: PipelineConfig;

  constructor() {
    this.config = DEFAULT_PIPELINE_CONFIG;
    validatePipelineConfig(this.config);
  }

  getConfig(): PipelineConfig {
    return this.config;
  }

  getInitialPhases(): PipelinePhase[] {
    return this.config.phases
      .filter((phase) => phase.dependsOn.length === 0)
      .map((phase) => phase.phase);
  }

  getPhaseConfig(phase: PipelinePhase): PhaseConfig {
    return getPhaseConfig(this.config, phase);
  }

  decideNextPhases(state: PipelineState): TransitionDecision {
    const queue = this.config.phases
      .filter((phaseConfig) => this.canQueuePhase(state, phaseConfig))
      .map((phaseConfig) => phaseConfig.phase);

    const blockedByRequiredFailure = this.hasRequiredFailure(state);
    const degraded =
      blockedByRequiredFailure ||
      this.config.phases.some(
        (phaseConfig) =>
          !phaseConfig.required &&
          state.phases[phaseConfig.phase].status === PhaseStatus.FAILED,
      ) ||
      state.quality === "degraded";

    const pipelineComplete =
      state.phases[PipelinePhase.SYNTHESIS].status === PhaseStatus.COMPLETED ||
      (blockedByRequiredFailure &&
        queue.length === 0 &&
        this.hasNoActiveWork(state));

    return {
      queue,
      blockedByRequiredFailure,
      pipelineComplete,
      degraded,
    };
  }

  private canQueuePhase(state: PipelineState, config: PhaseConfig): boolean {
    const phaseStatus = state.phases[config.phase].status;
    // WAITING means the phase is already queued and should not be queued again.
    if (phaseStatus !== PhaseStatus.PENDING) {
      return false;
    }

    if (!config.dependsOn.length) {
      return true;
    }

    for (const dep of config.dependsOn) {
      const depStatus = state.phases[dep].status;
      if (!isPhaseTerminal(depStatus)) {
        return false;
      }

      const depConfig = this.getPhaseConfig(dep);
      if (depStatus === PhaseStatus.FAILED && depConfig.required) {
        return false;
      }
    }

    return true;
  }

  private hasRequiredFailure(state: PipelineState): boolean {
    return this.config.phases.some(
      (phase) =>
        phase.required &&
        state.phases[phase.phase].status === PhaseStatus.FAILED,
    );
  }

  private hasNoActiveWork(state: PipelineState): boolean {
    return Object.values(state.phases).every(
      (phase) =>
        phase.status !== PhaseStatus.RUNNING &&
        phase.status !== PhaseStatus.WAITING,
    );
  }
}
