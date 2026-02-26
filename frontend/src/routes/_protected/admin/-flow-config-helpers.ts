import type { PipelineConfig } from "@/components/pipeline/types";

export interface FlowConfigRecord {
  id: string;
  name: string;
  status: string;
  version: number;
  updatedAt: string;
  pipelineConfig?: PipelineConfig;
  flowDefinition?: {
    flowId?: string;
    edges?: unknown;
    nodeConfigs?: unknown;
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function parseFlowConfigRecord(value: unknown): FlowConfigRecord | null {
  const unwrapped = isRecord(value) && "data" in value ? value.data : value;
  if (!isRecord(unwrapped)) {
    return null;
  }
  if (
    typeof unwrapped.id !== "string" ||
    typeof unwrapped.name !== "string" ||
    typeof unwrapped.status !== "string" ||
    typeof unwrapped.version !== "number" ||
    typeof unwrapped.updatedAt !== "string"
  ) {
    return null;
  }

  return unwrapped as unknown as FlowConfigRecord;
}

export function selectInitialFlowConfigCandidate(params: {
  flowId: string;
  activeConfig: FlowConfigRecord | null;
  configList: FlowConfigRecord[] | undefined;
}): FlowConfigRecord | null {
  const { flowId, activeConfig, configList } = params;

  if (
    activeConfig &&
    activeConfig.status === "published" &&
    activeConfig.flowDefinition?.flowId === flowId
  ) {
    return activeConfig;
  }

  const relevantConfigs = (configList ?? []).filter(
    (config) => config.flowDefinition?.flowId === flowId,
  );
  if (relevantConfigs.length === 0) {
    return null;
  }

  return (
    relevantConfigs.find((config) => config.status === "published") ??
    relevantConfigs.find((config) => config.status === "draft") ??
    null
  );
}
