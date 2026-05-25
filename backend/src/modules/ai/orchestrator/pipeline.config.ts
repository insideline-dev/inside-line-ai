import { QueueName, QUEUE_NAMES } from "../../../queue";
import { PhaseStatus, PipelinePhase, PipelineStage } from "../interfaces/pipeline.interface";

export type RetryBackoff = "exponential" | "linear" | "fixed";

export interface RetryPolicy {
  maxRetries: number;
  backoff: RetryBackoff;
  initialDelayMs: number;
}

export interface PhaseConfig {
  phase: PipelinePhase;
  stage: PipelineStage;
  dependsOn: PipelinePhase[];
  canRunParallelWith: PipelinePhase[];
  timeoutMs: number;
  maxRetries: number;
  required: boolean;
  queue: QueueName;
}

export interface PipelineConfig {
  phases: PhaseConfig[];
  maxPipelineTimeoutMs: number;
  defaultRetryPolicy: RetryPolicy;
  minimumEvaluationAgents: number;
}

export const PIPELINE_TERMINAL_STATUSES: ReadonlySet<PhaseStatus> = new Set([
  PhaseStatus.COMPLETED,
  PhaseStatus.FAILED,
  PhaseStatus.SKIPPED,
]);

export const DEFAULT_PIPELINE_CONFIG: PipelineConfig = {
  maxPipelineTimeoutMs: 180 * 60 * 1000,
  minimumEvaluationAgents: 8,
  defaultRetryPolicy: {
    maxRetries: 3,
    backoff: "exponential",
    initialDelayMs: 1000,
  },
  phases: [
    // ── Deal Screening ──────────────────────────────────────────────
    {
      phase: PipelinePhase.CLASSIFICATION,
      stage: PipelineStage.DEAL_SCREENING,
      dependsOn: [],
      canRunParallelWith: [],
      timeoutMs: 5 * 60 * 1000,
      maxRetries: 2,
      required: false,
      queue: QUEUE_NAMES.DOCUMENT_CLASSIFICATION,
    },
    {
      phase: PipelinePhase.EXTRACTION,
      stage: PipelineStage.DEAL_SCREENING,
      dependsOn: [PipelinePhase.CLASSIFICATION],
      canRunParallelWith: [],
      timeoutMs: 8 * 60 * 1000,
      maxRetries: 2,
      required: false,
      queue: QUEUE_NAMES.AI_EXTRACTION,
    },
    {
      phase: PipelinePhase.ENRICHMENT,
      stage: PipelineStage.DEAL_SCREENING,
      dependsOn: [PipelinePhase.EXTRACTION],
      canRunParallelWith: [PipelinePhase.SCRAPING],
      timeoutMs: 5 * 60 * 1000,
      maxRetries: 2,
      required: false,
      queue: QUEUE_NAMES.AI_ENRICHMENT,
    },
    {
      phase: PipelinePhase.SCRAPING,
      stage: PipelineStage.DEAL_SCREENING,
      dependsOn: [PipelinePhase.EXTRACTION],
      canRunParallelWith: [PipelinePhase.ENRICHMENT],
      timeoutMs: 10 * 60 * 1000,
      maxRetries: 2,
      required: false,
      queue: QUEUE_NAMES.AI_SCRAPING,
    },
    {
      phase: PipelinePhase.SCREENING,
      stage: PipelineStage.DEAL_SCREENING,
      dependsOn: [PipelinePhase.ENRICHMENT, PipelinePhase.SCRAPING],
      canRunParallelWith: [],
      timeoutMs: 5 * 60 * 1000,
      maxRetries: 2,
      required: true,
      queue: QUEUE_NAMES.AI_SCREENING,
    },
    // ── Due Diligence ──────────────────────────────────────────────
    {
      phase: PipelinePhase.RESEARCH,
      stage: PipelineStage.DUE_DILIGENCE,
      dependsOn: [PipelinePhase.SCREENING],
      canRunParallelWith: [],
      timeoutMs: 40 * 60 * 1000,
      maxRetries: 2,
      required: false,
      queue: QUEUE_NAMES.AI_RESEARCH,
    },
    {
      phase: PipelinePhase.EVALUATION,
      stage: PipelineStage.DUE_DILIGENCE,
      dependsOn: [PipelinePhase.RESEARCH],
      canRunParallelWith: [],
      timeoutMs: 150 * 60 * 1000,
      maxRetries: 2,
      required: true,
      queue: QUEUE_NAMES.AI_EVALUATION,
    },
    {
      phase: PipelinePhase.SYNTHESIS,
      stage: PipelineStage.DUE_DILIGENCE,
      dependsOn: [PipelinePhase.EVALUATION],
      canRunParallelWith: [],
      timeoutMs: 180 * 60 * 1000,
      maxRetries: 2,
      required: true,
      queue: QUEUE_NAMES.AI_SYNTHESIS,
    },
  ],
};

export const DEAL_SCREENING_PHASES: readonly PipelinePhase[] =
  DEFAULT_PIPELINE_CONFIG.phases
    .filter((p) => p.stage === PipelineStage.DEAL_SCREENING)
    .map((p) => p.phase);

export const DUE_DILIGENCE_PHASES: readonly PipelinePhase[] =
  DEFAULT_PIPELINE_CONFIG.phases
    .filter((p) => p.stage === PipelineStage.DUE_DILIGENCE)
    .map((p) => p.phase);

export function getPipelineStage(
  phase: PipelinePhase,
  config: PipelineConfig = DEFAULT_PIPELINE_CONFIG,
): PipelineStage {
  return getPhaseConfig(config, phase).stage;
}

export function isPhaseTerminal(status: PhaseStatus): boolean {
  return PIPELINE_TERMINAL_STATUSES.has(status);
}

export function getPhaseConfig(
  config: PipelineConfig,
  phase: PipelinePhase,
): PhaseConfig {
  const found = config.phases.find((item) => item.phase === phase);
  if (!found) {
    throw new Error(`Missing pipeline config for phase "${phase}"`);
  }
  return found;
}

export function validatePipelineConfig(config: PipelineConfig): void {
  if (!config.phases.length) {
    throw new Error("Pipeline config must declare at least one phase");
  }

  const knownPhases = new Set<PipelinePhase>();
  for (const phase of config.phases) {
    if (knownPhases.has(phase.phase)) {
      throw new Error(`Duplicate pipeline phase "${phase.phase}"`);
    }
    knownPhases.add(phase.phase);

    if (phase.timeoutMs <= 0) {
      throw new Error(`Phase "${phase.phase}" timeout must be > 0`);
    }
    if (phase.maxRetries < 0) {
      throw new Error(`Phase "${phase.phase}" maxRetries must be >= 0`);
    }
    for (const dep of phase.dependsOn) {
      if (dep === phase.phase) {
        throw new Error(`Phase "${phase.phase}" cannot depend on itself`);
      }
    }
  }

  for (const phase of config.phases) {
    for (const dep of phase.dependsOn) {
      if (!knownPhases.has(dep)) {
        throw new Error(
          `Phase "${phase.phase}" depends on unknown phase "${dep}"`,
        );
      }
    }
  }

  assertNoCycles(config);
}

function assertNoCycles(config: PipelineConfig): void {
  const graph = new Map<PipelinePhase, PipelinePhase[]>();
  for (const phase of config.phases) {
    graph.set(phase.phase, phase.dependsOn);
  }

  const visiting = new Set<PipelinePhase>();
  const visited = new Set<PipelinePhase>();

  const visit = (node: PipelinePhase): void => {
    if (visiting.has(node)) {
      throw new Error(`Pipeline config contains circular dependency at "${node}"`);
    }
    if (visited.has(node)) {
      return;
    }

    visiting.add(node);
    const deps = graph.get(node) ?? [];
    for (const dep of deps) {
      visit(dep);
    }
    visiting.delete(node);
    visited.add(node);
  };

  for (const phase of graph.keys()) {
    visit(phase);
  }
}
