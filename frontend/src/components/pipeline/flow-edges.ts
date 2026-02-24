import type { Edge } from "@xyflow/react";

export interface FlowEdgeDefinition {
  from: string;
  to: string;
  label?: string;
}

function resolvePipelinePhase(nodeId: string): string | null {
  if (nodeId === "extract_fields") return "extraction";
  if (nodeId === "scrape_website") return "scraping";
  if (nodeId === "gap_fill_hybrid" || nodeId === "linkedin_enrichment") {
    return "enrichment";
  }
  if (nodeId.startsWith("research_")) return "research";
  if (nodeId.startsWith("evaluation_")) return "evaluation";
  if (nodeId === "synthesis_final") return "synthesis";
  return null;
}

export function isExecutablePipelineEdgeConnection(
  sourceId: string | null | undefined,
  targetId: string | null | undefined,
): boolean {
  if (!sourceId || !targetId || sourceId === targetId) {
    return false;
  }
  const sourcePhase = resolvePipelinePhase(sourceId);
  const targetPhase = resolvePipelinePhase(targetId);
  if (!sourcePhase || !targetPhase) {
    return false;
  }
  return true;
}

export function toFlowEdgeDefinitions(edges: Edge[]): FlowEdgeDefinition[] {
  return edges
    .filter((edge) => edge.source && edge.target)
    .map((edge) => ({
      from: edge.source,
      to: edge.target,
      ...(typeof edge.label === "string" && edge.label.trim()
        ? { label: edge.label }
        : {}),
    }));
}

