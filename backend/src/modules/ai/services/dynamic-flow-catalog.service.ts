import { Injectable } from "@nestjs/common";
import type {
  AiFlowDefinition,
  AiFlowEdgeDefinition,
  AiFlowNodeDefinition,
} from "./ai-flow-catalog";
import { AI_FLOW_DEFINITIONS } from "./ai-flow-catalog";
import { AgentConfigService } from "./agent-config.service";
import { AiModelConfigService } from "./ai-model-config.service";
import { isAiPromptKey } from "./ai-prompt-catalog";

@Injectable()
export class DynamicFlowCatalogService {
  constructor(
    private agentConfigService: AgentConfigService,
    private modelConfigService: AiModelConfigService,
  ) {}

  async getFlowGraph(): Promise<{ flows: AiFlowDefinition[] }> {
    const configs = await this.agentConfigService.listAll();

    const flows = await Promise.all(
      AI_FLOW_DEFINITIONS.map(async (flow) => {
      if (flow.id !== "pipeline") {
        return flow;
      }

      const nodes = [...flow.nodes];
      const edges = [...flow.edges];

      for (const config of configs.filter((item) => item.flowId === "pipeline")) {
        const existingNodeIndex = nodes.findIndex((node) => this.matchesAgentNode(node.id, config));
        if (existingNodeIndex >= 0) {
          nodes[existingNodeIndex] = {
            ...nodes[existingNodeIndex],
            label: config.label,
            description: config.description ?? nodes[existingNodeIndex].description,
            kind: config.kind,
            outputs: nodes[existingNodeIndex].outputs,
            inputs: nodes[existingNodeIndex].inputs,
            // extra metadata used by frontend
            ...(config.enabled ? {} : { enabled: false }),
          } as AiFlowNodeDefinition;
          continue;
        }

        if (!config.isCustom) {
          continue;
        }

        const customNodeId = this.customNodeId(config.orchestratorNodeId, config.agentKey);
        const promptKey = `custom.${config.flowId}.${config.orchestratorNodeId}.${config.agentKey}`;

        nodes.push({
          id: customNodeId,
          label: config.label,
          description: config.description ?? "Custom AI agent",
          kind: config.kind,
          promptKeys: [promptKey as never],
          inputs: [{ label: "Orchestrator context", type: "object", fromNodeId: config.orchestratorNodeId }],
          outputs: [{ label: "Agent output", type: "object" }],
          ...(config.enabled ? {} : { enabled: false }),
        } as AiFlowNodeDefinition);

        edges.push({
          from: config.orchestratorNodeId,
          to: customNodeId,
          label: config.executionPhase > 1 ? `Phase ${config.executionPhase}` : "Custom",
        } as AiFlowEdgeDefinition);
      }

      const nodesWithModel = await Promise.all(
        nodes.map((node) => this.withNodeRuntimeModel(node)),
      );

      return {
        ...flow,
        nodes: nodesWithModel,
        edges,
      };
      }),
    );

    return { flows };
  }

  private async withNodeRuntimeModel(
    node: AiFlowNodeDefinition,
  ): Promise<AiFlowNodeDefinition> {
    const firstPromptKey = node.promptKeys[0];
    if (!firstPromptKey || !isAiPromptKey(firstPromptKey)) {
      return node;
    }

    try {
      const resolved = await this.modelConfigService.resolveConfig({
        key: firstPromptKey,
      });

      return {
        ...node,
        runtimeModel: {
          modelName: resolved.modelName,
          provider: resolved.provider,
          searchMode: resolved.searchMode,
          source: resolved.source,
        },
      };
    } catch {
      return node;
    }
  }

  private matchesAgentNode(nodeId: string, config: { orchestratorNodeId: string; agentKey: string }): boolean {
    if (config.orchestratorNodeId === "research_orchestrator") {
      return nodeId === `research_${config.agentKey}`;
    }

    if (config.orchestratorNodeId === "evaluation_orchestrator") {
      const snakeCase = config.agentKey
        .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
        .toLowerCase();
      return nodeId === `evaluation_${snakeCase}`;
    }

    return false;
  }

  private customNodeId(orchestratorNodeId: string, agentKey: string): string {
    return `${orchestratorNodeId}__custom__${agentKey}`;
  }
}
