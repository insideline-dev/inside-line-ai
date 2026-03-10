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
  sourceHandle?: string;
  targetHandle?: string;
  enabled?: boolean;
  mapping?: PipelineFlowEdgeMapping;
}

export interface PipelineFlowEdgeFieldMapEntry {
  fromPath: string;
  toKey: string;
  required?: boolean;
}

export interface PipelineFlowEdgeMapping {
  mode?: "full_output" | "field_map";
  fieldMap?: PipelineFlowEdgeFieldMapEntry[];
  mergeStrategy?: "object" | "array";
}

export interface PipelineFlowDefinition {
  flowId: "pipeline" | "clara";
  nodes: string[];
  edges: PipelineFlowEdgeDefinition[];
  nodeConfigs?: PipelineFlowNodeConfigs;
}

export interface PipelineFlowNodeConfigs {
  scrape_website?: PipelineFlowScrapeWebsiteConfig;
  [nodeId: string]: unknown;
}

export interface PipelineFlowScrapeWebsiteConfig {
  scraping?: PipelineFlowScrapingConfig;
}

export interface PipelineFlowScrapingConfig {
  manualPaths?: string[];
  discoveryEnabled?: boolean;
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
      const mapping = this.parseEdgeMapping(item.mapping);
      return {
        from: String(item.from).trim(),
        to: String(item.to).trim(),
        ...(typeof item.label === "string" && item.label.trim()
          ? { label: item.label.trim() }
          : {}),
        ...(typeof item.sourceHandle === "string" && item.sourceHandle.trim()
          ? { sourceHandle: item.sourceHandle.trim() }
          : {}),
        ...(typeof item.targetHandle === "string" && item.targetHandle.trim()
          ? { targetHandle: item.targetHandle.trim() }
          : {}),
        ...(typeof item.enabled === "boolean" ? { enabled: item.enabled } : {}),
        ...(mapping ? { mapping } : {}),
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
    const nodeConfigs = this.parseNodeConfigs(record.nodeConfigs, nodeSet);

    return {
      flowId,
      nodes,
      edges,
      ...(nodeConfigs ? { nodeConfigs } : {}),
    };
  }

  private parseNodeConfigs(
    value: unknown,
    nodeSet: Set<string>,
  ): PipelineFlowNodeConfigs | undefined {
    if (value === undefined) {
      return undefined;
    }
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("flowDefinition.nodeConfigs must be an object");
    }

    const nodeConfigsRecord = value as Record<string, unknown>;
    const parsed: PipelineFlowNodeConfigs = {};

    for (const [nodeId, rawNodeConfig] of Object.entries(nodeConfigsRecord)) {
      if (!nodeSet.has(nodeId)) {
        throw new Error(`flowDefinition.nodeConfigs references unknown node "${nodeId}"`);
      }

      if (nodeId === "scrape_website") {
        parsed.scrape_website = this.parseScrapeWebsiteConfig(rawNodeConfig);
        continue;
      }

      parsed[nodeId] = rawNodeConfig;
    }

    return Object.keys(parsed).length > 0 ? parsed : undefined;
  }

  private parseScrapeWebsiteConfig(
    value: unknown,
  ): PipelineFlowScrapeWebsiteConfig {
    if (value === undefined) {
      return {};
    }
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("flowDefinition.nodeConfigs.scrape_website must be an object");
    }

    const record = value as Record<string, unknown>;
    const scraping = this.parseScrapingConfig(record.scraping);
    return scraping ? { scraping } : {};
  }

  private parseScrapingConfig(
    value: unknown,
  ): PipelineFlowScrapingConfig | undefined {
    if (value === undefined) {
      return undefined;
    }
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error(
        "flowDefinition.nodeConfigs.scrape_website.scraping must be an object",
      );
    }

    const record = value as Record<string, unknown>;
    const manualPaths = this.parseManualPaths(record.manualPaths);
    const discoveryEnabled =
      typeof record.discoveryEnabled === "boolean"
        ? record.discoveryEnabled
        : true;

    return {
      ...(manualPaths.length > 0 ? { manualPaths } : {}),
      discoveryEnabled,
    };
  }

  private parseManualPaths(value: unknown): string[] {
    if (value === undefined) {
      return [];
    }
    if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
      throw new Error(
        "flowDefinition.nodeConfigs.scrape_website.scraping.manualPaths must be a string array",
      );
    }

    const deduped = new Set<string>();
    for (const rawPath of value) {
      const normalized = this.normalizeManualPath(rawPath);
      if (!normalized) {
        continue;
      }
      deduped.add(normalized);
    }

    return Array.from(deduped);
  }

  private normalizeManualPath(rawPath: string): string | null {
    const trimmed = rawPath.trim();
    if (!trimmed) {
      return null;
    }
    if (/^[a-z]+:\/\//i.test(trimmed)) {
      throw new Error(
        `Manual scrape path must be relative and cannot include protocol: "${rawPath}"`,
      );
    }
    if (trimmed.startsWith("//")) {
      throw new Error(
        `Manual scrape path must be relative and cannot include host: "${rawPath}"`,
      );
    }

    const slashNormalized = trimmed.replace(/\\/g, "/");
    const [withoutHash] = slashNormalized.split("#", 1);
    const [pathname] = withoutHash.split("?", 1);
    const prefixed = pathname.startsWith("/") ? pathname : `/${pathname}`;
    const collapsed = prefixed.replace(/\/{2,}/g, "/");
    const segments = collapsed.split("/").filter(Boolean);
    if (segments.some((segment) => segment === "..")) {
      throw new Error(
        `Manual scrape path cannot traverse parent segments: "${rawPath}"`,
      );
    }
    if (segments.some((segment) => segment === ".")) {
      return null;
    }

    if (collapsed === "/") {
      return "/";
    }
    return collapsed.endsWith("/") ? collapsed.slice(0, -1) : collapsed;
  }

  private parseEdgeMapping(
    value: unknown,
  ): PipelineFlowEdgeMapping | undefined {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return undefined;
    }
    const record = value as Record<string, unknown>;
    const modeRaw = record.mode;
    const mergeStrategyRaw = record.mergeStrategy;
    const fieldMapRaw = record.fieldMap;

    const mode =
      modeRaw === "full_output" || modeRaw === "field_map"
        ? modeRaw
        : undefined;
    const mergeStrategy =
      mergeStrategyRaw === "object" || mergeStrategyRaw === "array"
        ? mergeStrategyRaw
        : undefined;
    const fieldMap = Array.isArray(fieldMapRaw)
      ? fieldMapRaw
          .filter(
            (entry) =>
              entry &&
              typeof entry === "object" &&
              !Array.isArray(entry) &&
              typeof (entry as Record<string, unknown>).fromPath === "string" &&
              typeof (entry as Record<string, unknown>).toKey === "string",
          )
          .map((entry) => {
            const mapped = entry as Record<string, unknown>;
            return {
              fromPath: String(mapped.fromPath).trim(),
              toKey: String(mapped.toKey).trim(),
              ...(typeof mapped.required === "boolean"
                ? { required: mapped.required }
                : {}),
            };
          })
          .filter((entry) => entry.fromPath.length > 0 && entry.toKey.length > 0)
      : undefined;

    if (!mode && !mergeStrategy && (!fieldMap || fieldMap.length === 0)) {
      return undefined;
    }

    const result: PipelineFlowEdgeMapping = {};
    if (mode) {
      result.mode = mode;
    }
    if (mergeStrategy) {
      result.mergeStrategy = mergeStrategy;
    }
    if (fieldMap && fieldMap.length > 0) {
      result.fieldMap = fieldMap;
    }
    return result;
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
      if (edge.enabled === false) {
        continue;
      }
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
