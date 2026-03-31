import { beforeEach, describe, expect, it, jest } from "bun:test";
import { PipelinePhase } from "../../interfaces/pipeline.interface";
import type { EvaluationResult } from "../../interfaces/phase-results.interface";
import { EvaluationService } from "../../services/evaluation.service";
import type { EvaluationAgentRegistryService } from "../../services/evaluation-agent-registry.service";
import type { PipelineStateService } from "../../services/pipeline-state.service";
import type { DrizzleService } from "../../../../database";
import { createEvaluationPipelineInput } from "../fixtures/evaluation-pipeline.fixture";

function createDrizzleMock(stage: string | null = null) {
  return {
    db: {
      select: jest.fn().mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue(
              stage ? [{ stage }] : [],
            ),
          }),
        }),
      }),
    },
  } as unknown as jest.Mocked<DrizzleService>;
}

describe("EvaluationService", () => {
  let service: EvaluationService;
  let pipelineState: jest.Mocked<PipelineStateService>;
  let registry: jest.Mocked<EvaluationAgentRegistryService>;
  let drizzle: jest.Mocked<DrizzleService>;
  let pipelineInput: ReturnType<typeof createEvaluationPipelineInput>;

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
      fallbackAgents: 0,
      fallbackKeys: [],
      warnings: [],
      degraded: false,
    },
  } as unknown as EvaluationResult;

  beforeEach(() => {
    pipelineInput = createEvaluationPipelineInput();

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

    drizzle = createDrizzleMock("seed");

    service = new EvaluationService(
      pipelineState as unknown as PipelineStateService,
      registry as unknown as EvaluationAgentRegistryService,
      drizzle as unknown as DrizzleService,
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
      expect.objectContaining({
        extraction: pipelineInput.extraction,
        scraping: pipelineInput.scraping,
      }),
      expect.any(Function),
      expect.any(Function),
      expect.any(Function),
    );
    expect(result).toBe(evaluationResult);
  });

  it("forwards optional per-agent completion handler to registry", async () => {
    const onAgentComplete = jest.fn();

    await service.run("startup-1", { onAgentComplete });

    expect(registry.runAll).toHaveBeenCalledWith(
      "startup-1",
      expect.objectContaining({
        extraction: pipelineInput.extraction,
        scraping: pipelineInput.scraping,
      }),
      expect.any(Function),
      expect.any(Function),
      expect.any(Function),
    );

    const callback = registry.runAll.mock.calls[0]?.[3];
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
      expect.any(Function),
      expect.any(Function),
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
      expect(result.summary.failedAgents).toBe(0);
      expect(result.summary.fallbackAgents).toBe(1);
      expect(result.summary.fallbackKeys).toContain("team");
      expect(result.summary.warnings).toEqual([
        {
          agent: "team",
          message: "Agent generation failed, fallback used",
          reason: "UNHANDLED_AGENT_EXCEPTION",
        },
      ]);
      expect(result.summary.fallbackReasonCounts).toEqual({
        UNHANDLED_AGENT_EXCEPTION: 1,
      });
    });

    it("rerun updates fallback keys when usedFallback is true", async () => {
      const currentResult = {
        ...evaluationResult,
        summary: {
          ...evaluationResult.summary,
          failedAgents: 0,
          failedKeys: [],
          errors: [],
          fallbackAgents: 0,
          fallbackKeys: [],
          warnings: [],
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

      expect(result.summary.failedKeys).not.toContain("market");
      expect(result.summary.failedAgents).toBe(0);
      expect(result.summary.fallbackKeys).toContain("market");
      expect(result.summary.fallbackAgents).toBe(1);
      expect(result.summary.warnings).toEqual([
        {
          agent: "market",
          message: "Timeout during agent execution",
          reason: "UNHANDLED_AGENT_EXCEPTION",
        },
      ]);
      expect(result.summary.fallbackReasonCounts).toEqual({
        UNHANDLED_AGENT_EXCEPTION: 1,
      });
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
          fallbackAgents: 0,
          fallbackKeys: [],
          warnings: [],
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
      expect(result.summary.fallbackAgents).toBe(0);
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

  describe("database stage override", () => {
    it("overrides extraction.stage with DB stage when they differ", async () => {
      drizzle = createDrizzleMock("series_b");
      service = new EvaluationService(
        pipelineState as unknown as PipelineStateService,
        registry as unknown as EvaluationAgentRegistryService,
        drizzle as unknown as DrizzleService,
      );

      await service.run("startup-1");

      const passedInput = registry.runAll.mock.calls[0]?.[1];
      expect(passedInput?.extraction.stage).toBe("series_b");
    });

    it("preserves extraction.stage when DB stage matches", async () => {
      drizzle = createDrizzleMock("seed");
      service = new EvaluationService(
        pipelineState as unknown as PipelineStateService,
        registry as unknown as EvaluationAgentRegistryService,
        drizzle as unknown as DrizzleService,
      );

      await service.run("startup-1");

      const passedInput = registry.runAll.mock.calls[0]?.[1];
      expect(passedInput?.extraction.stage).toBe("seed");
    });

    it("preserves extraction.stage when startup record not found", async () => {
      drizzle = createDrizzleMock(null);
      service = new EvaluationService(
        pipelineState as unknown as PipelineStateService,
        registry as unknown as EvaluationAgentRegistryService,
        drizzle as unknown as DrizzleService,
      );

      await service.run("startup-1");

      const passedInput = registry.runAll.mock.calls[0]?.[1];
      expect(passedInput?.extraction.stage).toBe("seed");
    });
  });
});
