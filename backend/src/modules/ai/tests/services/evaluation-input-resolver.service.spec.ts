import { beforeEach, describe, expect, it, jest } from "bun:test";
import { ConfigService } from "@nestjs/config";
import { createEvaluationPipelineInput } from "../fixtures/evaluation-pipeline.fixture";
import { EvaluationInputResolverService } from "../../services/evaluation-input-resolver.service";
import type { PipelineFlowConfigService } from "../../services/pipeline-flow-config.service";
import type { PipelineGraphCompilerService } from "../../services/pipeline-graph-compiler.service";

describe("EvaluationInputResolverService", () => {
  let service: EvaluationInputResolverService;
  let config: jest.Mocked<ConfigService>;
  let pipelineFlowConfigService: jest.Mocked<PipelineFlowConfigService>;
  let graphCompiler: jest.Mocked<PipelineGraphCompilerService>;

  const pipelineData = createEvaluationPipelineInput();

  beforeEach(() => {
    config = {
      get: jest.fn().mockImplementation((key: string, fallback?: unknown) => {
        if (key === "AI_EDGE_DRIVEN_EVAL_INPUTS") {
          return true;
        }
        return fallback;
      }),
    } as unknown as jest.Mocked<ConfigService>;

    pipelineFlowConfigService = {
      getPublished: jest.fn(),
    } as unknown as jest.Mocked<PipelineFlowConfigService>;

    graphCompiler = {
      parseFlowDefinition: jest.fn(),
    } as unknown as jest.Mocked<PipelineGraphCompilerService>;

    service = new EvaluationInputResolverService(
      config,
      pipelineFlowConfigService,
      graphCompiler,
    );
  });

  it("maps combined research report text when direct research edges exist", async () => {
    pipelineFlowConfigService.getPublished.mockResolvedValueOnce({
      flowDefinition: { flowId: "pipeline", nodes: [], edges: [] },
    } as never);
    graphCompiler.parseFlowDefinition.mockReturnValueOnce({
      flowId: "pipeline",
      nodes: [],
      edges: [{ from: "research_team", to: "evaluation_team", enabled: true }],
    });

    const resolved = await service.resolveForAgent("team", pipelineData);

    expect(resolved.fallbackUsed).toBe(false);
    expect(resolved.mappedInputs.researchReportText).toBe(
      pipelineData.research.combinedReportText,
    );
    expect(resolved.sources).toEqual([
      { researchAgentId: "team", nodeId: "research_team" },
    ]);
    expect(resolved.pipelineData.edgeDrivenInputFallbackUsed).toBe(false);
  });

  it("coerces legacy non-string research branches when combined report is missing", async () => {
    pipelineFlowConfigService.getPublished.mockResolvedValueOnce({
      flowDefinition: { flowId: "pipeline", nodes: [], edges: [] },
    } as never);
    graphCompiler.parseFlowDefinition.mockReturnValueOnce({
      flowId: "pipeline",
      nodes: [],
      edges: [{ from: "research_market", to: "evaluation_market", enabled: true }],
    });

    const withLegacyResearch = createEvaluationPipelineInput();
    const legacyResearch = withLegacyResearch.research as unknown as {
      combinedReportText: unknown;
      team: unknown;
      market: unknown;
    };
    legacyResearch.combinedReportText = "";
    legacyResearch.team = { summary: "Legacy team payload" };
    legacyResearch.market = ["Legacy market payload"];

    const resolved = await service.resolveForAgent("market", withLegacyResearch);
    const reportText = String(resolved.mappedInputs.researchReportText ?? "");

    expect(reportText).toContain("Legacy team payload");
    expect(reportText).toContain("Legacy market payload");
    expect(resolved.fallbackUsed).toBe(false);
  });

  it("supports orchestrator fan-out for source attribution", async () => {
    pipelineFlowConfigService.getPublished.mockResolvedValueOnce({
      flowDefinition: { flowId: "pipeline", nodes: [], edges: [] },
    } as never);
    graphCompiler.parseFlowDefinition.mockReturnValueOnce({
      flowId: "pipeline",
      nodes: [],
      edges: [
        { from: "research_market", to: "evaluation_orchestrator", enabled: true },
        { from: "evaluation_orchestrator", to: "evaluation_market", enabled: true },
      ],
    });

    const resolved = await service.resolveForAgent("market", pipelineData);

    expect(resolved.fallbackUsed).toBe(false);
    expect(resolved.sources).toEqual([
      { researchAgentId: "market", nodeId: "research_market" },
    ]);
    expect(resolved.mappedInputs.researchReportText).toBe(
      pipelineData.research.combinedReportText,
    );
  });

  it("falls back when no inbound research edges exist", async () => {
    pipelineFlowConfigService.getPublished.mockResolvedValueOnce({
      flowDefinition: { flowId: "pipeline", nodes: [], edges: [] },
    } as never);
    graphCompiler.parseFlowDefinition.mockReturnValueOnce({
      flowId: "pipeline",
      nodes: [],
      edges: [{ from: "research_team", to: "evaluation_orchestrator", enabled: true }],
    });

    const resolved = await service.resolveForAgent("dealTerms", pipelineData);

    expect(resolved.fallbackUsed).toBe(true);
    expect(resolved.reason).toBe("no_research_edges");
    expect(resolved.pipelineData.edgeDrivenInputFallbackUsed).toBe(true);
    expect(resolved.mappedInputs.researchReportText).toBe(
      pipelineData.research.combinedReportText,
    );
  });

  it("falls back when field_map mapping is configured in text-only mode", async () => {
    pipelineFlowConfigService.getPublished.mockResolvedValueOnce({
      flowDefinition: { flowId: "pipeline", nodes: [], edges: [] },
    } as never);
    graphCompiler.parseFlowDefinition.mockReturnValueOnce({
      flowId: "pipeline",
      nodes: [],
      edges: [
        {
          from: "research_market",
          to: "evaluation_market",
          enabled: true,
          mapping: {
            mode: "field_map",
            fieldMap: [
              {
                fromPath: "marketSize.tam",
                toKey: "marketSizing.tam",
                required: true,
              },
            ],
          },
        },
      ],
    });

    const resolved = await service.resolveForAgent("market", pipelineData);

    expect(resolved.fallbackUsed).toBe(true);
    expect(resolved.reason).toBe("unsupported_text_only_mapping");
    expect(resolved.mappedInputs.researchReportText).toBe(
      pipelineData.research.combinedReportText,
    );
  });
});
