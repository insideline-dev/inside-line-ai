import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type {
  EvaluationAgentKey,
  EvaluationPipelineInput,
  ResearchAgentKey,
} from "../interfaces/agent.interface";
import type { ResearchResult } from "../interfaces/phase-results.interface";
import type {
  PipelineFlowDefinition,
  PipelineFlowEdgeDefinition,
} from "./pipeline-graph-compiler.service";
import { PipelineGraphCompilerService } from "./pipeline-graph-compiler.service";
import { PipelineFlowConfigService } from "./pipeline-flow-config.service";

export interface EvaluationInputSourceRef {
  researchAgentId: ResearchAgentKey;
  nodeId: string;
  path?: string;
}

export interface ResolvedEvaluationInput {
  pipelineData: EvaluationPipelineInput;
  mappedInputs: Record<string, unknown>;
  sources: EvaluationInputSourceRef[];
  fallbackUsed: boolean;
  reason?: string;
}

const RESEARCH_AGENT_KEYS: ResearchAgentKey[] = [
  "team",
  "market",
  "product",
  "news",
  "competitor",
];

@Injectable()
export class EvaluationInputResolverService {
  private readonly logger = new Logger(EvaluationInputResolverService.name);

  constructor(
    private config: ConfigService,
    private pipelineFlowConfigService: PipelineFlowConfigService,
    private graphCompiler: PipelineGraphCompilerService,
  ) {}

  async resolveForAgent(
    agentKey: EvaluationAgentKey,
    pipelineData: EvaluationPipelineInput,
  ): Promise<ResolvedEvaluationInput> {
    const researchReportText = this.buildCombinedResearchReport(pipelineData.research);
    const basePipelineData: EvaluationPipelineInput = { ...pipelineData };
    const mappedInputs: Record<string, unknown> = { researchReportText };

    if (!this.isEdgeDrivenEnabled()) {
      return this.fallback(basePipelineData, mappedInputs, "feature_disabled", false);
    }

    const flow = await this.loadPublishedPipelineFlowDefinition();
    if (!flow) {
      return this.fallback(
        basePipelineData,
        mappedInputs,
        "missing_flow_definition",
        true,
      );
    }

    const sourceEdges = this.resolveInboundResearchEdges(agentKey, flow.edges);
    if (sourceEdges.length === 0) {
      return this.fallback(basePipelineData, mappedInputs, "no_research_edges", true);
    }

    const sourceRefs: EvaluationInputSourceRef[] = [];
    const usesUnsupportedFieldMap = sourceEdges.some(
      (edge) => (edge.mapping?.mode ?? "full_output") === "field_map",
    );
    if (usesUnsupportedFieldMap) {
      return this.fallback(
        basePipelineData,
        mappedInputs,
        "unsupported_text_only_mapping",
        true,
      );
    }

    for (const edge of sourceEdges) {
      const researchAgentId = this.resolveResearchAgentKey(edge.from);
      if (!researchAgentId) {
        continue;
      }
      sourceRefs.push({
        researchAgentId,
        nodeId: edge.from,
      });
    }

    return {
      pipelineData: {
        ...basePipelineData,
        mappedInputs,
        mappedInputSources: sourceRefs,
        edgeDrivenInputFallbackUsed: false,
      },
      mappedInputs,
      sources: sourceRefs,
      fallbackUsed: false,
    };
  }

  private async loadPublishedPipelineFlowDefinition(): Promise<PipelineFlowDefinition | null> {
    const published = await this.pipelineFlowConfigService.getPublished();
    if (!published?.flowDefinition) {
      return null;
    }

    try {
      const flow = this.graphCompiler.parseFlowDefinition(published.flowDefinition);
      if (flow.flowId !== "pipeline") {
        return null;
      }
      return flow;
    } catch (error) {
      this.logger.warn(
        `Failed to parse published flow definition for evaluation input mapping: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return null;
    }
  }

  private resolveInboundResearchEdges(
    agentKey: EvaluationAgentKey,
    edges: PipelineFlowEdgeDefinition[],
  ): PipelineFlowEdgeDefinition[] {
    const enabledEdges = edges.filter((edge) => edge.enabled !== false);
    const evaluationNodeId = this.evaluationNodeIdFromAgentKey(agentKey);
    const directEdges = enabledEdges.filter(
      (edge) =>
        edge.to === evaluationNodeId && this.resolveResearchAgentKey(edge.from),
    );

    const orchestratorRoutesToAgent = enabledEdges.some(
      (edge) =>
        edge.from === "evaluation_orchestrator" && edge.to === evaluationNodeId,
    );
    if (!orchestratorRoutesToAgent) {
      return this.dedupeEdges(directEdges);
    }

    const orchestratorSourceEdges = enabledEdges.filter(
      (edge) =>
        edge.to === "evaluation_orchestrator" &&
        this.resolveResearchAgentKey(edge.from),
    );

    return this.dedupeEdges([...directEdges, ...orchestratorSourceEdges]);
  }

  private fallback(
    pipelineData: EvaluationPipelineInput,
    mappedInputs: Record<string, unknown>,
    reason: string,
    fallbackUsed = true,
  ): ResolvedEvaluationInput {
    return {
      pipelineData: {
        ...pipelineData,
        mappedInputs,
        mappedInputSources: [],
        edgeDrivenInputFallbackUsed: fallbackUsed,
      },
      mappedInputs,
      sources: [],
      fallbackUsed,
      reason,
    };
  }

  private buildCombinedResearchReport(research: ResearchResult): string {
    const combined = this.coerceResearchText(research.combinedReportText);
    if (combined && combined.length > 0) {
      return combined;
    }

    return RESEARCH_AGENT_KEYS
      .map((key) => {
        const value = this.coerceResearchText(research[key]);
        if (!value) {
          return null;
        }
        return `## ${key}\n${value}`;
      })
      .filter((value): value is string => Boolean(value))
      .join("\n\n");
  }

  private coerceResearchText(value: unknown): string {
    if (typeof value === "string") {
      return value.trim();
    }
    if (value == null) {
      return "";
    }
    try {
      return JSON.stringify(value, null, 2).trim();
    } catch {
      return String(value).trim();
    }
  }

  private dedupeEdges(edges: PipelineFlowEdgeDefinition[]): PipelineFlowEdgeDefinition[] {
    const seen = new Set<string>();
    const deduped: PipelineFlowEdgeDefinition[] = [];
    for (const edge of edges) {
      const key = `${edge.from}:${edge.sourceHandle ?? ""}->${edge.to}:${edge.targetHandle ?? ""}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      deduped.push(edge);
    }
    return deduped;
  }

  private evaluationNodeIdFromAgentKey(key: EvaluationAgentKey): string {
    if (key === "businessModel") {
      return "evaluation_business_model";
    }
    if (key === "competitiveAdvantage") {
      return "evaluation_competitive_advantage";
    }
    if (key === "dealTerms") {
      return "evaluation_deal_terms";
    }
    if (key === "exitPotential") {
      return "evaluation_exit_potential";
    }
    return `evaluation_${key}`;
  }

  private resolveResearchAgentKey(nodeId: string): ResearchAgentKey | null {
    if (!nodeId.startsWith("research_")) {
      return null;
    }
    if (nodeId === "research_team") {
      return "team";
    }
    if (nodeId === "research_market") {
      return "market";
    }
    if (nodeId === "research_product") {
      return "product";
    }
    if (nodeId === "research_news") {
      return "news";
    }
    if (nodeId === "research_competitor") {
      return "competitor";
    }
    return null;
  }

  private isEdgeDrivenEnabled(): boolean {
    return this.config.get<boolean>("AI_EDGE_DRIVEN_EVAL_INPUTS", false);
  }
}
