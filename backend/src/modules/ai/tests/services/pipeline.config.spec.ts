import { describe, expect, it } from "bun:test";
import { PipelinePhase, PipelineStage } from "../../interfaces/pipeline.interface";
import {
  DEAL_SCREENING_PHASES,
  DEFAULT_PIPELINE_CONFIG,
  DUE_DILIGENCE_PHASES,
  validatePipelineConfig,
} from "../../orchestrator/pipeline.config";

describe("pipeline.config", () => {
  it("validates the default pipeline config", () => {
    expect(() => validatePipelineConfig(DEFAULT_PIPELINE_CONFIG)).not.toThrow();
  });

  it("requires screening before evaluation", () => {
    const screening = DEFAULT_PIPELINE_CONFIG.phases.find(
      (phase) => phase.phase === PipelinePhase.SCREENING,
    );
    const evaluation = DEFAULT_PIPELINE_CONFIG.phases.find(
      (phase) => phase.phase === PipelinePhase.EVALUATION,
    );

    expect(screening?.canRunParallelWith).toEqual([]);
    expect(evaluation?.dependsOn).toEqual([PipelinePhase.RESEARCH]);
  });

  it("rejects duplicate phases", () => {
    const duplicated = {
      ...DEFAULT_PIPELINE_CONFIG,
      phases: [
        ...DEFAULT_PIPELINE_CONFIG.phases,
        { ...DEFAULT_PIPELINE_CONFIG.phases[0] },
      ],
    };

    expect(() => validatePipelineConfig(duplicated)).toThrow(
      'Duplicate pipeline phase "classification"',
    );
  });

  it("rejects missing dependency phases", () => {
    const invalid = {
      ...DEFAULT_PIPELINE_CONFIG,
      phases: DEFAULT_PIPELINE_CONFIG.phases.map((phase) =>
        phase.phase === PipelinePhase.RESEARCH
          ? { ...phase, dependsOn: ["ghost-phase" as PipelinePhase] }
          : phase,
      ),
    };

    expect(() => validatePipelineConfig(invalid)).toThrow(
      'Phase "research" depends on unknown phase "ghost-phase"',
    );
  });

  it("rejects circular dependency chains", () => {
    const circular = {
      ...DEFAULT_PIPELINE_CONFIG,
      phases: DEFAULT_PIPELINE_CONFIG.phases.map((phase) => {
        if (phase.phase === PipelinePhase.EXTRACTION) {
          return { ...phase, dependsOn: [PipelinePhase.SYNTHESIS] };
        }
        return phase;
      }),
    };

    expect(() => validatePipelineConfig(circular)).toThrow(
      'Pipeline config contains circular dependency at "extraction"',
    );
  });

  it("deal screening phases end with SCREENING", () => {
    expect(DEAL_SCREENING_PHASES.at(-1)).toBe(PipelinePhase.SCREENING);
    expect(DEAL_SCREENING_PHASES).toEqual([
      PipelinePhase.CLASSIFICATION,
      PipelinePhase.EXTRACTION,
      PipelinePhase.ENRICHMENT,
      PipelinePhase.SCRAPING,
      PipelinePhase.SCREENING,
    ]);
  });

  it("due diligence phases start with RESEARCH", () => {
    expect(DUE_DILIGENCE_PHASES[0]).toBe(PipelinePhase.RESEARCH);
    expect(DUE_DILIGENCE_PHASES).toEqual([
      PipelinePhase.RESEARCH,
      PipelinePhase.EVALUATION,
      PipelinePhase.SYNTHESIS,
    ]);
  });

  it("every phase belongs to exactly one stage", () => {
    const allPhases = [...DEAL_SCREENING_PHASES, ...DUE_DILIGENCE_PHASES];
    const configPhases = DEFAULT_PIPELINE_CONFIG.phases.map((p) => p.phase);
    expect(allPhases).toEqual(configPhases);
  });

  it("stage field matches grouping constants", () => {
    for (const phaseConfig of DEFAULT_PIPELINE_CONFIG.phases) {
      if (DEAL_SCREENING_PHASES.includes(phaseConfig.phase)) {
        expect(phaseConfig.stage).toBe(PipelineStage.DEAL_SCREENING);
      } else {
        expect(phaseConfig.stage).toBe(PipelineStage.DUE_DILIGENCE);
      }
    }
  });

  it("rejects non-positive timeout values", () => {
    const invalid = {
      ...DEFAULT_PIPELINE_CONFIG,
      phases: DEFAULT_PIPELINE_CONFIG.phases.map((phase) =>
        phase.phase === PipelinePhase.SYNTHESIS
          ? { ...phase, timeoutMs: 0 }
          : phase,
      ),
    };

    expect(() => validatePipelineConfig(invalid)).toThrow(
      'Phase "synthesis" timeout must be > 0',
    );
  });
});
