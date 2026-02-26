import { describe, expect, it } from "bun:test";
import { PIPELINE_DEFINITION } from "../../services/ai-flow-catalog";
import {
  DEFAULT_PIPELINE_CONFIG,
  type PipelineConfig,
} from "../../orchestrator/pipeline.config";
import { PipelinePhase } from "../../interfaces/pipeline.interface";
import { PipelineGraphCompilerService } from "../../services/pipeline-graph-compiler.service";

function createFlowDefinition() {
  return {
    flowId: "pipeline",
    nodes: PIPELINE_DEFINITION.nodes.map((node) => node.id),
    edges: PIPELINE_DEFINITION.edges.map((edge) => ({
      from: edge.from,
      to: edge.to,
      ...(edge.label ? { label: edge.label } : {}),
    })),
  };
}

describe("PipelineGraphCompilerService", () => {
  const service = new PipelineGraphCompilerService();

  it("derives runtime phase dependencies from graph edges", () => {
    const compiled = service.compilePipelineConfig(
      createFlowDefinition(),
      DEFAULT_PIPELINE_CONFIG,
    );
    const byPhase = new Map(compiled.phases.map((phase) => [phase.phase, phase]));

    expect(byPhase.get(PipelinePhase.EXTRACTION)?.dependsOn).toEqual([]);
    expect(byPhase.get(PipelinePhase.ENRICHMENT)?.dependsOn).toEqual([
      PipelinePhase.EXTRACTION,
      PipelinePhase.SCRAPING,
    ]);
    expect(byPhase.get(PipelinePhase.SCRAPING)?.dependsOn).toEqual([
      PipelinePhase.EXTRACTION,
    ]);
    expect(byPhase.get(PipelinePhase.RESEARCH)?.dependsOn).toEqual([
      PipelinePhase.ENRICHMENT,
      PipelinePhase.SCRAPING,
    ]);
    expect(byPhase.get(PipelinePhase.EVALUATION)?.dependsOn).toEqual([
      PipelinePhase.RESEARCH,
    ]);
    expect(byPhase.get(PipelinePhase.SYNTHESIS)?.dependsOn).toEqual([
      PipelinePhase.EVALUATION,
    ]);
  });

  it("ignores edges mapped to non-runnable phases", () => {
    const compiled = service.compilePipelineConfig(
      createFlowDefinition(),
      DEFAULT_PIPELINE_CONFIG,
    );
    const synthesis = compiled.phases.find(
      (phase) => phase.phase === PipelinePhase.SYNTHESIS,
    );

    expect(synthesis?.dependsOn).toEqual([PipelinePhase.EVALUATION]);
  });

  it("rejects graph edges that reference unknown nodes", () => {
    const flow = createFlowDefinition();
    flow.edges.push({ from: "ghost-node", to: "extract_fields" });

    expect(() =>
      service.compilePipelineConfig(flow, DEFAULT_PIPELINE_CONFIG),
    ).toThrow('Flow edge references unknown source node "ghost-node"');
  });

  it("rejects phase cycles introduced by graph edges", () => {
    const flow = createFlowDefinition();
    flow.edges.push({ from: "synthesis_final", to: "extract_fields" });

    expect(() =>
      service.compilePipelineConfig(flow, DEFAULT_PIPELINE_CONFIG),
    ).toThrow('Pipeline config contains circular dependency at "extraction"');
  });

  it("preserves non-dependency phase config from base config", () => {
    const base: PipelineConfig = {
      ...DEFAULT_PIPELINE_CONFIG,
      phases: DEFAULT_PIPELINE_CONFIG.phases.map((phase) =>
        phase.phase === PipelinePhase.RESEARCH
          ? { ...phase, timeoutMs: 123_000, maxRetries: 5 }
          : phase,
      ),
    };

    const compiled = service.compilePipelineConfig(createFlowDefinition(), base);
    const research = compiled.phases.find(
      (phase) => phase.phase === PipelinePhase.RESEARCH,
    );

    expect(research?.timeoutMs).toBe(123_000);
    expect(research?.maxRetries).toBe(5);
  });

  it("parses scrape_website node scraping config with normalized manual paths", () => {
    const parsed = service.parseFlowDefinition({
      ...createFlowDefinition(),
      nodeConfigs: {
        scrape_website: {
          scraping: {
            manualPaths: ["about", "/team/", "/about?x=1", "/team#bio"],
            discoveryEnabled: true,
          },
        },
      },
    });

    expect(parsed.nodeConfigs?.scrape_website?.scraping).toEqual({
      manualPaths: ["/about", "/team"],
      discoveryEnabled: true,
    });
  });

  it("rejects absolute URLs in scrape_website manual paths", () => {
    expect(() =>
      service.parseFlowDefinition({
        ...createFlowDefinition(),
        nodeConfigs: {
          scrape_website: {
            scraping: {
              manualPaths: ["https://example.com/about"],
            },
          },
        },
      }),
    ).toThrow("Manual scrape path must be relative and cannot include protocol");
  });
});
