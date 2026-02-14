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
      runOne: jest.fn().mockResolvedValue({
        agent: "market",
        output: { score: 91 },
        usedFallback: false,
      }),
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
    expect(registry.runAll).toHaveBeenCalledWith(
      "startup-1",
      {
        extraction: pipelineInput.extraction,
        scraping: pipelineInput.scraping,
        research: pipelineInput.research,
      },
      expect.any(Function),
    );
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
      expect.any(Function),
    );

    const callback = registry.runAll.mock.calls[0]?.[2];
    expect(typeof callback).toBe("function");
    callback?.({
      agent: "team",
      output: { score: 80 },
      usedFallback: false,
      error: undefined,
    });
    expect(onAgentComplete).toHaveBeenCalledTimes(1);
  });

  it("throws when required upstream phase results are missing", async () => {
    pipelineState.getPhaseResult.mockResolvedValueOnce(null as never);

    await expect(service.run("startup-1")).rejects.toThrow(
      "Evaluation requires extraction, scraping, and research results",
    );
    expect(registry.runAll).not.toHaveBeenCalled();
  });

  it("reruns a single agent and merges it into the existing evaluation", async () => {
    pipelineState.getPhaseResult.mockImplementation(
      (_startupId: string, phase: PipelinePhase) => {
        if (phase === PipelinePhase.EXTRACTION) {
          return Promise.resolve(pipelineInput.extraction);
        }

        if (phase === PipelinePhase.SCRAPING) {
          return Promise.resolve(pipelineInput.scraping);
        }

        if (phase === PipelinePhase.RESEARCH) {
          return Promise.resolve(pipelineInput.research);
        }

        if (phase === PipelinePhase.EVALUATION) {
          return Promise.resolve(evaluationResult);
        }

        return Promise.resolve(null);
      },
    );

    const result = await service.run("startup-1", { agentKey: "market" });

    expect(registry.runOne).toHaveBeenCalledWith(
      "startup-1",
      "market",
      expect.objectContaining({
        extraction: pipelineInput.extraction,
      }),
    );
    expect(result.market).toEqual({ score: 91 });
    expect(result.summary.failedAgents).toBe(0);
  });

  describe("rerun with fallback output edge cases", () => {
    it("rerun with fallback output still merges output even when safeParse fails", async () => {
      pipelineState.getPhaseResult.mockImplementation(
        (_startupId: string, phase: PipelinePhase) => {
          if (phase === PipelinePhase.EXTRACTION) return Promise.resolve(pipelineInput.extraction);
          if (phase === PipelinePhase.SCRAPING) return Promise.resolve(pipelineInput.scraping);
          if (phase === PipelinePhase.RESEARCH) return Promise.resolve(pipelineInput.research);
          if (phase === PipelinePhase.EVALUATION) return Promise.resolve(evaluationResult);
          return Promise.resolve(null);
        },
      );

      registry.runOne.mockResolvedValueOnce({
        agent: "team",
        output: { invalidSchema: "bad data" },
        usedFallback: true,
        error: "Agent generation failed, fallback used",
      });

      const result = await service.run("startup-1", { agentKey: "team" });

      expect(result.team).toEqual({ invalidSchema: "bad data" });
      expect(result.summary.failedAgents).toBe(1);
      expect(result.summary.failedKeys).toContain("team");
    });

    it("rerun updates failedKeys when usedFallback is true", async () => {
      const currentResult = {
        ...evaluationResult,
        summary: {
          ...evaluationResult.summary,
          failedAgents: 0,
          failedKeys: [],
          errors: [],
        },
      };

      pipelineState.getPhaseResult.mockImplementation(
        (_startupId: string, phase: PipelinePhase) => {
          if (phase === PipelinePhase.EXTRACTION) return Promise.resolve(pipelineInput.extraction);
          if (phase === PipelinePhase.SCRAPING) return Promise.resolve(pipelineInput.scraping);
          if (phase === PipelinePhase.RESEARCH) return Promise.resolve(pipelineInput.research);
          if (phase === PipelinePhase.EVALUATION) return Promise.resolve(currentResult);
          return Promise.resolve(null);
        },
      );

      registry.runOne.mockResolvedValueOnce({
        agent: "market",
        output: { score: 60 },
        usedFallback: true,
        error: "Timeout during agent execution",
      });

      const result = await service.run("startup-1", { agentKey: "market" });

      expect(result.summary.failedKeys).toContain("market");
      expect(result.summary.failedAgents).toBe(1);
      expect(result.summary.errors).toEqual([
        {
          agent: "market",
          error: "Timeout during agent execution",
        },
      ]);
    });

    it("rerun clears previous errors for that agent", async () => {
      const currentResult = {
        ...evaluationResult,
        summary: {
          ...evaluationResult.summary,
          failedAgents: 1,
          failedKeys: ["market"],
          errors: [
            { agent: "market", error: "Previous error" },
          ],
        },
      };

      pipelineState.getPhaseResult.mockImplementation(
        (_startupId: string, phase: PipelinePhase) => {
          if (phase === PipelinePhase.EXTRACTION) return Promise.resolve(pipelineInput.extraction);
          if (phase === PipelinePhase.SCRAPING) return Promise.resolve(pipelineInput.scraping);
          if (phase === PipelinePhase.RESEARCH) return Promise.resolve(pipelineInput.research);
          if (phase === PipelinePhase.EVALUATION) return Promise.resolve(currentResult);
          return Promise.resolve(null);
        },
      );

      registry.runOne.mockResolvedValueOnce({
        agent: "market",
        output: { score: 85 },
        usedFallback: false,
      });

      const result = await service.run("startup-1", { agentKey: "market" });

      expect(result.summary.errors).toEqual([]);
      expect(result.summary.failedKeys).not.toContain("market");
      expect(result.summary.failedAgents).toBe(0);
    });

    it("missing upstream results throws error", async () => {
      pipelineState.getPhaseResult.mockResolvedValueOnce(pipelineInput.extraction);
      pipelineState.getPhaseResult.mockResolvedValueOnce(null);

      await expect(service.run("startup-1")).rejects.toThrow(
        "Evaluation requires extraction, scraping, and research results",
      );
      expect(registry.runAll).not.toHaveBeenCalled();
    });

    it("missing research result throws error", async () => {
      pipelineState.getPhaseResult.mockImplementation(
        (_startupId: string, phase: PipelinePhase) => {
          if (phase === PipelinePhase.EXTRACTION) return Promise.resolve(pipelineInput.extraction);
          if (phase === PipelinePhase.SCRAPING) return Promise.resolve(pipelineInput.scraping);
          if (phase === PipelinePhase.RESEARCH) return Promise.resolve(null);
          return Promise.resolve(null);
        },
      );

      await expect(service.run("startup-1")).rejects.toThrow(
        "Evaluation requires extraction, scraping, and research results",
      );
      expect(registry.runAll).not.toHaveBeenCalled();
    });
  });
});
