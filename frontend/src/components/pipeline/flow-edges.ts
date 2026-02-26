import type { Edge } from "@xyflow/react";

export interface FlowEdgeFieldMapEntry {
  fromPath: string;
  toKey: string;
  required?: boolean;
}

export interface FlowEdgeMapping {
  mode?: "full_output" | "field_map";
  fieldMap?: FlowEdgeFieldMapEntry[];
  mergeStrategy?: "object" | "array";
}

export interface FlowEdgeDefinition {
  from: string;
  to: string;
  label?: string;
  sourceHandle?: string;
  targetHandle?: string;
  enabled?: boolean;
  mapping?: FlowEdgeMapping;
}

function sanitizeFlowEdgeMapping(value: unknown): FlowEdgeMapping | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  const mode =
    record.mode === "full_output" || record.mode === "field_map"
      ? record.mode
      : undefined;
  const mergeStrategy =
    record.mergeStrategy === "object" || record.mergeStrategy === "array"
      ? record.mergeStrategy
      : undefined;
  const fieldMap = Array.isArray(record.fieldMap)
    ? record.fieldMap
        .filter(
          (item) =>
            item &&
            typeof item === "object" &&
            !Array.isArray(item) &&
            typeof (item as Record<string, unknown>).fromPath === "string" &&
            typeof (item as Record<string, unknown>).toKey === "string",
        )
        .map((item) => {
          const entry = item as Record<string, unknown>;
          return {
            fromPath: String(entry.fromPath).trim(),
            toKey: String(entry.toKey).trim(),
            ...(typeof entry.required === "boolean"
              ? { required: entry.required }
              : {}),
          };
        })
        .filter((item) => item.fromPath.length > 0 && item.toKey.length > 0)
    : undefined;

  if (!mode && !mergeStrategy && (!fieldMap || fieldMap.length === 0)) {
    return undefined;
  }

  const mapping: FlowEdgeMapping = {};
  if (mode) {
    mapping.mode = mode;
  }
  if (mergeStrategy) {
    mapping.mergeStrategy = mergeStrategy;
  }
  if (fieldMap && fieldMap.length > 0) {
    mapping.fieldMap = fieldMap;
  }
  return mapping;
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
    .map((edge) => {
      const edgeData =
        edge.data && typeof edge.data === "object" && !Array.isArray(edge.data)
          ? (edge.data as Record<string, unknown>)
          : undefined;
      const mapping = sanitizeFlowEdgeMapping(edgeData?.mapping);
      return {
        from: edge.source,
        to: edge.target,
        ...(typeof edge.label === "string" && edge.label.trim()
          ? { label: edge.label }
          : {}),
        ...(typeof edge.sourceHandle === "string" && edge.sourceHandle.trim()
          ? { sourceHandle: edge.sourceHandle }
          : {}),
        ...(typeof edge.targetHandle === "string" && edge.targetHandle.trim()
          ? { targetHandle: edge.targetHandle }
          : {}),
        ...(typeof edgeData?.enabled === "boolean"
          ? { enabled: edgeData.enabled }
          : {}),
        ...(mapping ? { mapping } : {}),
      };
    });
}
