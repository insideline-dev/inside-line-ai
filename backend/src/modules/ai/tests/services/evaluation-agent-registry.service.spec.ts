import { beforeEach, describe, expect, it, jest } from "bun:test";
import type {
  EvaluationAgent,
  EvaluationAgentKey,
} from "../../interfaces/agent.interface";
import { EvaluationAgentRegistryService } from "../../services/evaluation-agent-registry.service";
import { PipelineStateService } from "../../services/pipeline-state.service";
import type { PhaseTransitionService } from "../../orchestrator/phase-transition.service";
import { createEvaluationPipelineInput } from "../fixtures/evaluation-pipeline.fixture";

const ALL_KEYS: EvaluationAgentKey[] = [
  "team",
  "market",
  "product",
  "traction",
  "businessModel",
  "gtm",
  "financials",
  "competitiveAdvantage",
  "legal",
  "dealTerms",
  "exitPotential",
];

type FakeAgent = EvaluationAgent<unknown> & {
  key: EvaluationAgentKey;
};

function createAgent(
  key: EvaluationAgentKey,
  options?: { fallback?: boolean; reject?: boolean },
): FakeAgent {
  return {
    key,
    run: jest.fn().mockImplementation(async () => {
      if (options?.reject) {
        throw new Error(`${key} hard failure`);
      }

      return {
        key,
        output: {
          score: 80,
          keyFindings: ["ok"],
          risks: [],
          dataGaps: [],
          sources: [],
        },
        usedFallback: Boolean(options?.fallback),
        error: options?.fallback ? `${key} fallback` : undefined,
      };
    }),
    fallback: jest.fn().mockReturnValue({
      score: 50,
      keyFindings: ["fallback"],
      risks: [],
      dataGaps: [],
      sources: [],
    }),
  };
}

function createRegistry(
  agents: FakeAgent[],
  pipelineState: PipelineStateService,
  phaseTransition: PhaseTransitionService,
): EvaluationAgentRegistryService {
  const constructorArgs = [
    agents[0],
    agents[1],
    agents[2],
    agents[3],
    agents[4],
    agents[5],
    agents[6],
    agents[7],
    agents[8],
    agents[9],
    agents[10],
    pipelineState,
    phaseTransition,
  ] as unknown as ConstructorParameters<typeof EvaluationAgentRegistryService>;

  return new EvaluationAgentRegistryService(...constructorArgs);
}

describe("EvaluationAgentRegistryService", () => {
  let pipelineState: jest.Mocked<PipelineStateService>;
  let phaseTransition: jest.Mocked<PhaseTransitionService>;
  const pipelineData = createEvaluationPipelineInput();

  beforeEach(() => {
    pipelineState = {
      recordAgentTelemetry: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<PipelineStateService>;

    phaseTransition = {
      getConfig: jest.fn().mockReturnValue({
        minimumEvaluationAgents: 8,
      }),
    } as unknown as jest.Mocked<PhaseTransitionService>;
  });

  it("marks run as healthy when all agents return structured outputs", async () => {
    const agents = ALL_KEYS.map((key) => createAgent(key));

    const service = createRegistry(
      agents,
      pipelineState as unknown as PipelineStateService,
      phaseTransition as unknown as PhaseTransitionService,
    );

    const result = await service.runAll("startup-1", pipelineData);

    expect(result.summary.completedAgents).toBe(11);
    expect(result.summary.failedAgents).toBe(0);
    expect(result.summary.degraded).toBe(false);
    expect(pipelineState.recordAgentTelemetry).toHaveBeenCalledTimes(11);
  });

  it("marks run as degraded when fewer than 8 agents succeed", async () => {
    const fallbackKeys = new Set<EvaluationAgentKey>([
      "team",
      "market",
      "product",
      "traction",
    ]);

    const agents = ALL_KEYS.map((key) =>
      createAgent(key, { fallback: fallbackKeys.has(key) }),
    );

    const service = createRegistry(
      agents,
      pipelineState as unknown as PipelineStateService,
      phaseTransition as unknown as PhaseTransitionService,
    );

    const result = await service.runAll("startup-2", pipelineData);

    expect(result.summary.completedAgents).toBe(7);
    expect(result.summary.failedAgents).toBe(4);
    expect(result.summary.degraded).toBe(true);
    expect(result.summary.failedKeys.sort()).toEqual(Array.from(fallbackKeys).sort());
  });

  it("uses agent fallback output when an agent throws", async () => {
    const agents = ALL_KEYS.map((key) =>
      createAgent(key, { reject: key === "market" }),
    );

    const service = createRegistry(
      agents,
      pipelineState as unknown as PipelineStateService,
      phaseTransition as unknown as PhaseTransitionService,
    );

    const result = await service.runAll("startup-3", pipelineData);

    expect(result.summary.failedKeys).toContain("market");
    expect(agents[1].fallback).toHaveBeenCalledTimes(1);
  });

  it("emits per-agent completion payload via callback", async () => {
    const agents = ALL_KEYS.map((key) => createAgent(key));
    const callback = jest.fn();

    const service = createRegistry(
      agents,
      pipelineState as unknown as PipelineStateService,
      phaseTransition as unknown as PhaseTransitionService,
    );

    await service.runAll("startup-4", pipelineData, callback);

    expect(callback).toHaveBeenCalledTimes(11);
    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({
        agent: "team",
        usedFallback: false,
      }),
    );
  });

  it("continues when telemetry recording fails", async () => {
    const agents = ALL_KEYS.map((key) => createAgent(key));
    pipelineState.recordAgentTelemetry.mockRejectedValueOnce(
      new Error("redis unavailable"),
    );

    const service = createRegistry(
      agents,
      pipelineState as unknown as PipelineStateService,
      phaseTransition as unknown as PhaseTransitionService,
    );

    const result = await service.runAll("startup-5", pipelineData);

    expect(result.summary.degraded).toBe(false);
    expect(result.summary.failedAgents).toBe(0);
  });
});
