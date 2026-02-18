import { describe, expect, it } from "bun:test";
import { PipelinePhase } from "../../interfaces/pipeline.interface";
import {
  DEFAULT_PIPELINE_CONFIG,
  validatePipelineConfig,
} from "../../orchestrator/pipeline.config";

describe("pipeline.config", () => {
  it("validates the default pipeline config", () => {
    expect(() => validatePipelineConfig(DEFAULT_PIPELINE_CONFIG)).not.toThrow();
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
      'Duplicate pipeline phase "enrichment"',
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
