import { beforeEach, describe, expect, it, jest } from "bun:test";
import { PipelinePhase } from "../../interfaces/pipeline.interface";
import type { EvaluationResult } from "../../interfaces/phase-results.interface";
import { EvaluationService } from "../../services/evaluation.service";
import type { EvaluationAgentRegistryService } from "../../services/evaluation-agent-registry.service";
import type { PipelineStateService } from "../../services/pipeline-state.service";
import { createEvaluationPipelineInput } from "../fixtures/evaluation-pipeline.fixture";

describe("EvaluationService", () => {
  let service: EvaluationService;
  let pipelineState: jest.Mocked<PipelineStateService>;
  let registry: jest.Mocked<EvaluationAgentRegistryService>;

  const pipelineInput = createEvaluationPipelineInput();

  const evaluationResult = {
    team: { score: 80 },
    market: { score: 78 },
    product: { score: 82 },
    traction: { score: 69 },
    businessModel: { score: 74 },
    gtm: { score: 71 },
    financials: { score: 67 },
    competitiveAdvantage: { score: 76 },
    legal: { score: 73 },
    dealTerms: { score: 70 },
    exitPotential: { score: 75 },
    summary: {
      completedAgents: 11,
      failedAgents: 0,
      minimumRequired: 8,
      failedKeys: [],
      errors: [],
      degraded: false,
    },
  } as unknown as EvaluationResult;

  beforeEach(() => {
    pipelineState = {
      getPhaseResult: jest
        .fn()
        .mockImplementation((_startupId: string, phase: PipelinePhase) => {
          if (phase === PipelinePhase.EXTRACTION) {
            return Promise.resolve(pipelineInput.extraction);
          }

          if (phase === PipelinePhase.SCRAPING) {
            return Promise.resolve(pipelineInput.scraping);
          }

          if (phase === PipelinePhase.RESEARCH) {
            return Promise.resolve(pipelineInput.research);
          }

          return Promise.resolve(null);
        }),
    } as unknown as jest.Mocked<PipelineStateService>;

    registry = {
      runAll: jest.fn().mockResolvedValue(evaluationResult),
    } as unknown as jest.Mocked<EvaluationAgentRegistryService>;

    service = new EvaluationService(
      pipelineState as unknown as PipelineStateService,
      registry as unknown as EvaluationAgentRegistryService,
    );
  });

  it("loads extraction/scraping/research results and runs all evaluation agents", async () => {
    const result = await service.run("startup-1");

    expect(pipelineState.getPhaseResult).toHaveBeenCalledWith(
      "startup-1",
      PipelinePhase.EXTRACTION,
    );
    expect(pipelineState.getPhaseResult).toHaveBeenCalledWith(
      "startup-1",
      PipelinePhase.SCRAPING,
    );
    expect(pipelineState.getPhaseResult).toHaveBeenCalledWith(
      "startup-1",
      PipelinePhase.RESEARCH,
    );
    expect(registry.runAll).toHaveBeenCalledWith("startup-1", {
      extraction: pipelineInput.extraction,
      scraping: pipelineInput.scraping,
      research: pipelineInput.research,
    }, undefined);
    expect(result).toBe(evaluationResult);
  });

  it("forwards optional per-agent completion handler to registry", async () => {
    const onAgentComplete = jest.fn();

    await service.run("startup-1", { onAgentComplete });

    expect(registry.runAll).toHaveBeenCalledWith(
      "startup-1",
      {
        extraction: pipelineInput.extraction,
        scraping: pipelineInput.scraping,
        research: pipelineInput.research,
      },
      onAgentComplete,
    );
  });

  it("throws when required upstream phase results are missing", async () => {
    pipelineState.getPhaseResult.mockResolvedValueOnce(null as never);

    await expect(service.run("startup-1")).rejects.toThrow(
      "Evaluation requires extraction, scraping, and research results",
    );
    expect(registry.runAll).not.toHaveBeenCalled();
  });
});
