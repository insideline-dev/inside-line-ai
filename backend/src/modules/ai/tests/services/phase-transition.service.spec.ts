import { describe, expect, it } from "bun:test";
import {
  PhaseStatus,
  PipelinePhase,
  PipelineStatus,
  type PipelineState,
} from "../../interfaces/pipeline.interface";
import { PhaseTransitionService } from "../../orchestrator/phase-transition.service";

function createState(
  phases: Partial<Record<PipelinePhase, PhaseStatus>>,
): PipelineState {
  return {
    pipelineRunId: "run-1",
    startupId: "startup-1",
    userId: "user-1",
    status: PipelineStatus.RUNNING,
    quality: "standard",
    currentPhase: PipelinePhase.ENRICHMENT,
    phases: {
      [PipelinePhase.ENRICHMENT]: {
        status: phases[PipelinePhase.ENRICHMENT] ?? PhaseStatus.COMPLETED,
      },
      [PipelinePhase.EXTRACTION]: {
        status: phases[PipelinePhase.EXTRACTION] ?? PhaseStatus.PENDING,
      },
      [PipelinePhase.SCRAPING]: {
        status: phases[PipelinePhase.SCRAPING] ?? PhaseStatus.PENDING,
      },
      [PipelinePhase.RESEARCH]: {
        status: phases[PipelinePhase.RESEARCH] ?? PhaseStatus.PENDING,
      },
      [PipelinePhase.EVALUATION]: {
        status: phases[PipelinePhase.EVALUATION] ?? PhaseStatus.PENDING,
      },
      [PipelinePhase.SYNTHESIS]: {
        status: phases[PipelinePhase.SYNTHESIS] ?? PhaseStatus.PENDING,
      },
    },
    results: {},
    retryCounts: {},
    telemetry: {
      startedAt: new Date().toISOString(),
      totalTokens: {
        input: 0,
        output: 0,
      },
      phases: {
        [PipelinePhase.ENRICHMENT]: {
          phase: PipelinePhase.ENRICHMENT,
          agentCount: 0,
          successCount: 0,
          failedCount: 0,
        },
        [PipelinePhase.EXTRACTION]: {
          phase: PipelinePhase.EXTRACTION,
          agentCount: 0,
          successCount: 0,
          failedCount: 0,
        },
        [PipelinePhase.SCRAPING]: {
          phase: PipelinePhase.SCRAPING,
          agentCount: 0,
          successCount: 0,
          failedCount: 0,
        },
        [PipelinePhase.RESEARCH]: {
          phase: PipelinePhase.RESEARCH,
          agentCount: 0,
          successCount: 0,
          failedCount: 0,
        },
        [PipelinePhase.EVALUATION]: {
          phase: PipelinePhase.EVALUATION,
          agentCount: 0,
          successCount: 0,
          failedCount: 0,
        },
        [PipelinePhase.SYNTHESIS]: {
          phase: PipelinePhase.SYNTHESIS,
          agentCount: 0,
          successCount: 0,
          failedCount: 0,
        },
      },
      agents: {},
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

describe("PhaseTransitionService", () => {
  const service = new PhaseTransitionService();

  it("does not queue research until extraction and scraping are terminal", () => {
    const state = createState({
      [PipelinePhase.EXTRACTION]: PhaseStatus.COMPLETED,
      [PipelinePhase.SCRAPING]: PhaseStatus.RUNNING,
    });

    const decision = service.decideNextPhases(state);
    expect(decision.queue).toEqual([]);
  });

  it("queues research when extraction fails but scraping completes", () => {
    const state = createState({
      [PipelinePhase.EXTRACTION]: PhaseStatus.FAILED,
      [PipelinePhase.SCRAPING]: PhaseStatus.COMPLETED,
      [PipelinePhase.RESEARCH]: PhaseStatus.PENDING,
    });

    const decision = service.decideNextPhases(state);
    expect(decision.queue).toEqual([PipelinePhase.RESEARCH]);
    expect(decision.degraded).toBe(true);
  });

  it("queues evaluation when research fails (optional phase)", () => {
    const state = createState({
      [PipelinePhase.EXTRACTION]: PhaseStatus.COMPLETED,
      [PipelinePhase.SCRAPING]: PhaseStatus.COMPLETED,
      [PipelinePhase.RESEARCH]: PhaseStatus.FAILED,
      [PipelinePhase.EVALUATION]: PhaseStatus.PENDING,
    });

    const decision = service.decideNextPhases(state);
    expect(decision.queue).toEqual([PipelinePhase.EVALUATION]);
  });

  it("does not re-queue phases already in waiting state", () => {
    const state = createState({
      [PipelinePhase.EXTRACTION]: PhaseStatus.COMPLETED,
      [PipelinePhase.ENRICHMENT]: PhaseStatus.WAITING,
      [PipelinePhase.SCRAPING]: PhaseStatus.WAITING,
    });

    const decision = service.decideNextPhases(state);
    expect(decision.queue).toEqual([]);
  });

  it("marks pipeline blocked when required phase fails", () => {
    const state = createState({
      [PipelinePhase.EXTRACTION]: PhaseStatus.COMPLETED,
      [PipelinePhase.SCRAPING]: PhaseStatus.COMPLETED,
      [PipelinePhase.RESEARCH]: PhaseStatus.COMPLETED,
      [PipelinePhase.EVALUATION]: PhaseStatus.FAILED,
      [PipelinePhase.SYNTHESIS]: PhaseStatus.PENDING,
    });

    const decision = service.decideNextPhases(state);
    expect(decision.blockedByRequiredFailure).toBe(true);
    expect(decision.queue).toEqual([]);
    expect(decision.pipelineComplete).toBe(true);
  });

  it("marks pipeline complete once synthesis finishes", () => {
    const state = createState({
      [PipelinePhase.EXTRACTION]: PhaseStatus.COMPLETED,
      [PipelinePhase.SCRAPING]: PhaseStatus.COMPLETED,
      [PipelinePhase.RESEARCH]: PhaseStatus.COMPLETED,
      [PipelinePhase.EVALUATION]: PhaseStatus.COMPLETED,
      [PipelinePhase.SYNTHESIS]: PhaseStatus.COMPLETED,
    });

    const decision = service.decideNextPhases(state);
    expect(decision.pipelineComplete).toBe(true);
    expect(decision.blockedByRequiredFailure).toBe(false);
  });
});
