import { beforeEach, describe, expect, it, jest } from "bun:test";
import type {
  EvaluationAgent,
  EvaluationAgentKey,
} from "../../interfaces/agent.interface";
import { PipelinePhase } from "../../interfaces/pipeline.interface";
import { EvaluationAgentRegistryService } from "../../services/evaluation-agent-registry.service";
import { PipelineStateService } from "../../services/pipeline-state.service";
import type { PhaseTransitionService } from "../../orchestrator/phase-transition.service";
import type { PipelineFeedbackService } from "../../services/pipeline-feedback.service";
import type { PipelineAgentTraceService } from "../../services/pipeline-agent-trace.service";
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
  pipelineFeedback: PipelineFeedbackService,
  pipelineAgentTrace?: PipelineAgentTraceService,
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
    pipelineFeedback,
    pipelineAgentTrace,
  ] as unknown as ConstructorParameters<typeof EvaluationAgentRegistryService>;

  return new EvaluationAgentRegistryService(...constructorArgs);
}

describe("EvaluationAgentRegistryService", () => {
  let pipelineState: jest.Mocked<PipelineStateService>;
  let phaseTransition: jest.Mocked<PhaseTransitionService>;
  let pipelineFeedback: jest.Mocked<PipelineFeedbackService>;
  const pipelineData = createEvaluationPipelineInput();

  beforeEach(() => {
    pipelineState = {
      get: jest.fn().mockResolvedValue({ pipelineRunId: "run-1" }),
      recordAgentTelemetry: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<PipelineStateService>;

    phaseTransition = {
      getConfig: jest.fn().mockReturnValue({
        minimumEvaluationAgents: 8,
      }),
    } as unknown as jest.Mocked<PhaseTransitionService>;

    pipelineFeedback = {
      getContext: jest.fn().mockResolvedValue({ items: [] }),
      markConsumedByScope: jest.fn().mockResolvedValue(0),
    } as unknown as jest.Mocked<PipelineFeedbackService>;
  });

  it("marks run as healthy when all agents return structured outputs", async () => {
    const agents = ALL_KEYS.map((key) => createAgent(key));

    const service = createRegistry(
      agents,
      pipelineState as unknown as PipelineStateService,
      phaseTransition as unknown as PhaseTransitionService,
      pipelineFeedback as unknown as PipelineFeedbackService,
    );

    const result = await service.runAll("startup-1", pipelineData);

    expect(result.summary.completedAgents).toBe(11);
    expect(result.summary.failedAgents).toBe(0);
    expect(result.summary.fallbackAgents).toBe(0);
    expect(result.summary.fallbackKeys).toEqual([]);
    expect(result.summary.degraded).toBe(false);
    expect(pipelineState.recordAgentTelemetry).toHaveBeenCalledTimes(11);
  });

  it("marks run as degraded when agents use fallback outputs", async () => {
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
      pipelineFeedback as unknown as PipelineFeedbackService,
    );

    const result = await service.runAll("startup-2", pipelineData);

    expect(result.summary.completedAgents).toBe(11);
    expect(result.summary.failedAgents).toBe(0);
    expect(result.summary.fallbackAgents).toBe(4);
    expect(result.summary.degraded).toBe(true);
    expect(result.summary.fallbackKeys?.sort()).toEqual(
      Array.from(fallbackKeys).sort(),
    );
    expect(result.summary.fallbackReasonCounts).toEqual({
      UNHANDLED_AGENT_EXCEPTION: 4,
    });
  });

  it("uses agent fallback output when an agent throws", async () => {
    const agents = ALL_KEYS.map((key) =>
      createAgent(key, { reject: key === "market" }),
    );

    const service = createRegistry(
      agents,
      pipelineState as unknown as PipelineStateService,
      phaseTransition as unknown as PhaseTransitionService,
      pipelineFeedback as unknown as PipelineFeedbackService,
    );

    const result = await service.runAll("startup-3", pipelineData);

    expect(result.summary.failedKeys).not.toContain("market");
    expect(result.summary.fallbackKeys).toContain("market");
    expect(result.summary.fallbackReasonCounts).toEqual({
      UNHANDLED_AGENT_EXCEPTION: 1,
    });
    expect(agents[1].fallback).toHaveBeenCalledTimes(1);
  });

  it("emits per-agent completion payload via callback", async () => {
    const agents = ALL_KEYS.map((key) => createAgent(key));
    const onAgentStart = jest.fn();
    const onAgentComplete = jest.fn();

    const service = createRegistry(
      agents,
      pipelineState as unknown as PipelineStateService,
      phaseTransition as unknown as PhaseTransitionService,
      pipelineFeedback as unknown as PipelineFeedbackService,
    );

    await service.runAll("startup-4", pipelineData, onAgentStart, onAgentComplete);

    expect(onAgentStart).toHaveBeenCalledTimes(11);
    expect(onAgentComplete).toHaveBeenCalledTimes(11);
    expect(onAgentComplete).toHaveBeenCalledWith(
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
      pipelineFeedback as unknown as PipelineFeedbackService,
    );

    const result = await service.runAll("startup-5", pipelineData);

    expect(result.summary.degraded).toBe(false);
    expect(result.summary.failedAgents).toBe(0);
  });

  it("reruns one evaluation agent", async () => {
    const agents = ALL_KEYS.map((key) => createAgent(key));
    const service = createRegistry(
      agents,
      pipelineState as unknown as PipelineStateService,
      phaseTransition as unknown as PhaseTransitionService,
      pipelineFeedback as unknown as PipelineFeedbackService,
    );

    const result = await service.runOne("startup-6", "market", pipelineData);

    expect(result.agent).toBe("market");
    expect(result.usedFallback).toBe(false);
    expect((agents[1].run as jest.Mock).mock.calls.length).toBe(1);
    expect(pipelineFeedback.markConsumedByScope).toHaveBeenCalledWith({
      startupId: "startup-6",
      phase: PipelinePhase.EVALUATION,
      agentKey: "market",
    });
    expect(pipelineFeedback.markConsumedByScope).toHaveBeenCalledWith({
      startupId: "startup-6",
      phase: PipelinePhase.EVALUATION,
      agentKey: null,
    });
  });

  it("passes structured feedback notes to evaluation agents", async () => {
    const agents = ALL_KEYS.map((key) => createAgent(key));
    const now = new Date();
    pipelineFeedback.getContext
      .mockResolvedValueOnce({
        items: [
          {
            id: "phase-feedback",
            startupId: "startup-7",
            phase: PipelinePhase.EVALUATION,
            agentKey: null,
            feedback: "Validate assumptions",
            metadata: null,
            createdBy: "admin-1",
            consumedAt: null,
            createdAt: now,
            updatedAt: now,
          },
        ],
      })
      .mockResolvedValueOnce({
        items: [
          {
            id: "agent-feedback",
            startupId: "startup-7",
            phase: PipelinePhase.EVALUATION,
            agentKey: "team",
            feedback: "Focus on founder fit",
            metadata: null,
            createdBy: "admin-1",
            consumedAt: null,
            createdAt: new Date(now.getTime() + 1000),
            updatedAt: new Date(now.getTime() + 1000),
          },
        ],
      });

    const service = createRegistry(
      agents,
      pipelineState as unknown as PipelineStateService,
      phaseTransition as unknown as PhaseTransitionService,
      pipelineFeedback as unknown as PipelineFeedbackService,
    );

    await service.runOne("startup-7", "team", pipelineData);

    expect(agents[0].run).toHaveBeenCalledWith(
      pipelineData,
      expect.objectContaining({
        feedbackNotes: expect.arrayContaining([
          expect.objectContaining({
            scope: "phase",
            feedback: "Validate assumptions",
          }),
          expect.objectContaining({
            scope: "agent:team",
            feedback: "Focus on founder fit",
          }),
        ]),
      }),
    );
  });

  it("does not consume feedback when runOne uses fallback", async () => {
    const agents = ALL_KEYS.map((key) =>
      createAgent(key, { reject: key === "team" }),
    );
    const service = createRegistry(
      agents,
      pipelineState as unknown as PipelineStateService,
      phaseTransition as unknown as PhaseTransitionService,
      pipelineFeedback as unknown as PipelineFeedbackService,
    );

    const result = await service.runOne("startup-8", "team", pipelineData);

    expect(result.usedFallback).toBe(true);
    expect(pipelineFeedback.markConsumedByScope).not.toHaveBeenCalled();
  });

  it("waits for pending trace writes before returning", async () => {
    let traceResolved = false;
    const traceService = {
      recordRun: jest.fn().mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            setTimeout(() => {
              traceResolved = true;
              resolve();
            }, 20);
          }),
      ),
    } as unknown as PipelineAgentTraceService;

    const agents = ALL_KEYS.map((key) => createAgent(key));
    (agents[0].run as jest.Mock).mockImplementationOnce(
      async (
        _pipelineData: unknown,
        options?: { onTrace?: (event: unknown) => void },
      ) => {
        options?.onTrace?.({
          agent: "team",
          status: "completed",
          inputPrompt: "prompt",
          outputText: "{}",
          outputJson: { score: 80 },
          attempt: 1,
          retryCount: 0,
          usedFallback: false,
        });
        return {
          key: "team",
          output: { score: 80, keyFindings: [], risks: [], dataGaps: [], sources: [] },
          usedFallback: false,
        };
      },
    );

    const service = createRegistry(
      agents,
      pipelineState as unknown as PipelineStateService,
      phaseTransition as unknown as PhaseTransitionService,
      pipelineFeedback as unknown as PipelineFeedbackService,
      traceService,
    );

    await service.runAll("startup-9", pipelineData);

    expect(traceService.recordRun).toHaveBeenCalled();
    expect(traceResolved).toBe(true);
  });
});
