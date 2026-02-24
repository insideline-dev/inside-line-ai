import { Injectable } from "@nestjs/common";
import { PipelinePhase } from "../interfaces/pipeline.interface";
import {
  type PipelineConfig,
  validatePipelineConfig,
} from "../orchestrator/pipeline.config";

export interface PipelineFlowEdgeDefinition {
  from: string;
  to: string;
  label?: string;
}

export interface PipelineFlowDefinition {
  flowId: "pipeline" | "clara";
  nodes: string[];
  edges: PipelineFlowEdgeDefinition[];
}

@Injectable()
export class PipelineGraphCompilerService {
  parseFlowDefinition(raw: unknown): PipelineFlowDefinition {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new Error("flowDefinition must be an object");
    }

    const record = raw as Record<string, unknown>;
    const flowId = record.flowId;
    if (flowId !== "pipeline" && flowId !== "clara") {
      throw new Error('flowDefinition.flowId must be "pipeline" or "clara"');
    }

    const nodesRaw = record.nodes;
    if (!Array.isArray(nodesRaw) || nodesRaw.some((node) => typeof node !== "string")) {
      throw new Error("flowDefinition.nodes must be an array of node IDs");
    }
    const nodes = nodesRaw.map((node) => node.trim()).filter(Boolean);
    if (nodes.length === 0) {
      throw new Error("flowDefinition.nodes must include at least one node");
    }

    const edgesRaw = record.edges;
    if (
      !Array.isArray(edgesRaw) ||
      edgesRaw.some(
        (edge) =>
          !edge ||
          typeof edge !== "object" ||
          Array.isArray(edge) ||
          typeof (edge as Record<string, unknown>).from !== "string" ||
          typeof (edge as Record<string, unknown>).to !== "string",
      )
    ) {
      throw new Error("flowDefinition.edges must be an array of { from, to } entries");
    }

    const edges = edgesRaw.map((edge) => {
      const item = edge as Record<string, unknown>;
      return {
        from: String(item.from).trim(),
        to: String(item.to).trim(),
        ...(typeof item.label === "string" && item.label.trim()
          ? { label: item.label.trim() }
          : {}),
      };
    });

    const nodeSet = new Set(nodes);
    for (const edge of edges) {
      if (!nodeSet.has(edge.from)) {
        throw new Error(`Flow edge references unknown source node "${edge.from}"`);
      }
      if (!nodeSet.has(edge.to)) {
        throw new Error(`Flow edge references unknown target node "${edge.to}"`);
      }
      if (edge.from === edge.to) {
        throw new Error(`Flow edge cannot self-reference node "${edge.from}"`);
      }
    }

    return {
      flowId,
      nodes,
      edges,
    };
  }

  compilePipelineConfig(
    flowDefinition: PipelineFlowDefinition,
    baseConfig: PipelineConfig,
  ): PipelineConfig {
    const normalizedFlow = this.parseFlowDefinition(flowDefinition);
    if (normalizedFlow.flowId !== "pipeline") {
      throw new Error(`Unsupported flowId "${normalizedFlow.flowId}" for pipeline compilation`);
    }

    validatePipelineConfig(baseConfig);
    const phaseOrder = baseConfig.phases.map((phase) => phase.phase);
    const phaseOrderIndex = new Map(
      phaseOrder.map((phase, index) => [phase, index] as const),
    );
    const knownPhases = new Set(phaseOrder);
    const depsByPhase = new Map<PipelinePhase, Set<PipelinePhase>>();

    for (const phase of phaseOrder) {
      depsByPhase.set(phase, new Set());
    }

    for (const edge of normalizedFlow.edges) {
      const fromPhase = this.resolvePhaseForNode(edge.from);
      const toPhase = this.resolvePhaseForNode(edge.to);

      if (!fromPhase || !toPhase || fromPhase === toPhase) {
        continue;
      }
      if (!knownPhases.has(fromPhase) || !knownPhases.has(toPhase)) {
        continue;
      }

      depsByPhase.get(toPhase)?.add(fromPhase);
    }

    const compiled: PipelineConfig = {
      ...baseConfig,
      phases: baseConfig.phases.map((phase) => {
        const inferredDependsOn = Array.from(depsByPhase.get(phase.phase) ?? []).sort(
          (left, right) =>
            (phaseOrderIndex.get(left) ?? 0) - (phaseOrderIndex.get(right) ?? 0),
        );
        return {
          ...phase,
          dependsOn:
            inferredDependsOn.length > 0 ? inferredDependsOn : phase.dependsOn,
        };
      }),
    };

    validatePipelineConfig(compiled);
    this.assertSynthesisReachable(compiled);
    return compiled;
  }

  private resolvePhaseForNode(nodeId: string): PipelinePhase | null {
    if (nodeId === "extract_fields") {
      return PipelinePhase.EXTRACTION;
    }
    if (nodeId === "scrape_website") {
      return PipelinePhase.SCRAPING;
    }
    if (nodeId === "gap_fill_hybrid" || nodeId === "linkedin_enrichment") {
      return PipelinePhase.ENRICHMENT;
    }
    if (nodeId.startsWith("research_")) {
      return PipelinePhase.RESEARCH;
    }
    if (nodeId.startsWith("evaluation_")) {
      return PipelinePhase.EVALUATION;
    }
    if (nodeId === "synthesis_final") {
      return PipelinePhase.SYNTHESIS;
    }

    return null;
  }

  private assertSynthesisReachable(config: PipelineConfig): void {
    const dependents = new Map<PipelinePhase, PipelinePhase[]>();
    for (const phase of config.phases) {
      if (!dependents.has(phase.phase)) {
        dependents.set(phase.phase, []);
      }
      for (const dep of phase.dependsOn) {
        const current = dependents.get(dep) ?? [];
        current.push(phase.phase);
        dependents.set(dep, current);
      }
    }

    const roots = config.phases
      .filter((phase) => phase.dependsOn.length === 0)
      .map((phase) => phase.phase);
    const visited = new Set<PipelinePhase>();
    const queue = [...roots];

    while (queue.length > 0) {
      const phase = queue.shift();
      if (!phase || visited.has(phase)) {
        continue;
      }
      visited.add(phase);
      for (const next of dependents.get(phase) ?? []) {
        queue.push(next);
      }
    }

    if (!visited.has(PipelinePhase.SYNTHESIS)) {
      throw new Error("Compiled graph does not reach synthesis");
    }
  }
}
