import { beforeEach, describe, expect, it, jest } from "bun:test";
import { ConfigService } from "@nestjs/config";
import { PipelineFlowConfigService } from "../../services/pipeline-flow-config.service";
import {
  DEFAULT_PIPELINE_CONFIG,
  type PipelineConfig,
} from "../../orchestrator/pipeline.config";
import { PipelineGraphCompilerService } from "../../services/pipeline-graph-compiler.service";

describe("PipelineFlowConfigService#getEffectiveConfig", () => {
  let service: PipelineFlowConfigService;
  let compiler: jest.Mocked<PipelineGraphCompilerService>;
  let config: jest.Mocked<ConfigService>;

  beforeEach(() => {
    compiler = {
      compilePipelineConfig: jest.fn(),
      parseFlowDefinition: jest.fn(),
    } as unknown as jest.Mocked<PipelineGraphCompilerService>;
    config = {
      get: jest.fn(),
    } as unknown as jest.Mocked<ConfigService>;

    service = new PipelineFlowConfigService(
      { db: {} } as never,
      compiler,
      config,
    );
  });

  it("returns default config when no published config exists", async () => {
    jest.spyOn(service, "getPublished").mockResolvedValueOnce(null);

    const result = await service.getEffectiveConfig();
    expect(result).toEqual(DEFAULT_PIPELINE_CONFIG);
  });

  it("returns stored pipeline config when edge-driven mode is disabled", async () => {
    config.get.mockReturnValue(false);
    const stored = {
      ...DEFAULT_PIPELINE_CONFIG,
      maxPipelineTimeoutMs: 99_000,
    } as PipelineConfig;
    jest.spyOn(service, "getPublished").mockResolvedValueOnce({
      pipelineConfig: stored,
      flowDefinition: {},
    } as never);

    const result = await service.getEffectiveConfig();

    expect(result).toEqual(stored);
    expect(compiler.compilePipelineConfig).not.toHaveBeenCalled();
  });

  it("uses compiler output when edge-driven mode is enabled", async () => {
    config.get.mockReturnValue(true);
    const stored = { ...DEFAULT_PIPELINE_CONFIG } as PipelineConfig;
    const compiled = {
      ...DEFAULT_PIPELINE_CONFIG,
      minimumEvaluationAgents: 11,
    } as PipelineConfig;
    compiler.compilePipelineConfig.mockReturnValueOnce(compiled);
    jest.spyOn(service, "getPublished").mockResolvedValueOnce({
      pipelineConfig: stored,
      flowDefinition: {
        flowId: "pipeline",
        nodes: ["extract_fields"],
        edges: [],
      },
    } as never);
    compiler.parseFlowDefinition.mockReturnValueOnce({
      flowId: "pipeline",
      nodes: ["extract_fields"],
      edges: [],
    });

    const result = await service.getEffectiveConfig();

    expect(result).toEqual(compiled);
    expect(compiler.compilePipelineConfig).toHaveBeenCalledWith(
      {
        flowId: "pipeline",
        nodes: ["extract_fields"],
        edges: [],
      },
      stored,
    );
  });

  it("falls back to stored config when compiler throws", async () => {
    config.get.mockReturnValue(true);
    const stored = {
      ...DEFAULT_PIPELINE_CONFIG,
      maxPipelineTimeoutMs: 42_000,
    } as PipelineConfig;
    compiler.compilePipelineConfig.mockImplementationOnce(() => {
      throw new Error("bad graph");
    });
    jest.spyOn(service, "getPublished").mockResolvedValueOnce({
      pipelineConfig: stored,
      flowDefinition: {
        flowId: "pipeline",
        nodes: ["extract_fields"],
        edges: [],
      },
    } as never);
    compiler.parseFlowDefinition.mockReturnValueOnce({
      flowId: "pipeline",
      nodes: ["extract_fields"],
      edges: [],
    });

    const result = await service.getEffectiveConfig();

    expect(result).toEqual(stored);
  });
});
