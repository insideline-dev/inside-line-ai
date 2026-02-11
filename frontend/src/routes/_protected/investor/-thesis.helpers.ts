export interface GeographyNode {
  id: string;
  label: string;
  level: number;
  children?: GeographyNode[];
}

export interface ThesisFormData {
  stages: string[];
  industries: string[];
  geographicFocusNodes: string[];
  checkSizeMin: number;
  checkSizeMax: number;
  notes: string;
}

export function extractResponseData<T>(payload: unknown): T | null {
  if (payload === null || payload === undefined) {
    return null;
  }

  if (
    typeof payload === "object" &&
    !Array.isArray(payload) &&
    "data" in (payload as Record<string, unknown>) &&
    (payload as Record<string, unknown>).data !== undefined
  ) {
    return (payload as { data: T }).data;
  }

  return payload as T;
}

export function flattenNodes(nodes: GeographyNode[]): GeographyNode[] {
  return nodes.flatMap((node) => [node, ...(node.children ? flattenNodes(node.children) : [])]);
}

export function mapLegacyLabelsToNodeIds(
  legacyLabels: string[] | undefined,
  taxonomyNodes: GeographyNode[],
): string[] {
  if (!legacyLabels?.length || taxonomyNodes.length === 0) {
    return [];
  }

  const byLabel = new Map<string, string>();
  for (const node of flattenNodes(taxonomyNodes)) {
    byLabel.set(node.label.toLowerCase(), node.id);
  }

  const mapped = new Set<string>();
  for (const label of legacyLabels) {
    const normalized = label.trim().toLowerCase();
    if (!normalized) {
      continue;
    }

    const direct = byLabel.get(normalized);
    if (direct) {
      mapped.add(direct);
      continue;
    }

    if (normalized === "middle east" || normalized === "mena") {
      mapped.add("l1:mena");
      continue;
    }

    if (normalized === "asia pacific" || normalized === "apac" || normalized === "asia") {
      mapped.add("l1:south_asia");
      mapped.add("l1:southeast_asia");
      mapped.add("l1:east_asia");
      continue;
    }

    if (normalized === "latam") {
      mapped.add("l1:latin_america");
    }
  }

  return Array.from(mapped);
}

export function toggleGeographyNodeSelection(
  selectedNodeIds: string[],
  nodeId: string,
  checked: boolean,
): string[] {
  if (checked) {
    return Array.from(new Set([...selectedNodeIds, nodeId]));
  }

  return selectedNodeIds.filter((id) => id !== nodeId);
}

export function buildThesisSavePayload(formData: ThesisFormData) {
  return {
    stages: formData.stages,
    industries: formData.industries,
    checkSizeMin: formData.checkSizeMin,
    checkSizeMax: formData.checkSizeMax,
    geographicFocusNodes: formData.geographicFocusNodes,
    notes: formData.notes,
  };
}
