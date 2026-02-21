import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { and, asc, eq } from "drizzle-orm";
import { DrizzleService } from "../../../database";
import {
  aiAgentConfig,
  aiPromptDefinition,
  type AiAgentConfig,
} from "../entities";
import { AI_FLOW_DEFINITIONS } from "./ai-flow-catalog";

export interface CreateAgentConfigInput {
  agentKey: string;
  label: string;
  description?: string;
  executionPhase?: number;
  dependsOn?: string[];
  sortOrder?: number;
}

export interface UpdateAgentConfigInput {
  label?: string;
  description?: string;
  executionPhase?: number;
  dependsOn?: string[];
  sortOrder?: number;
  enabled?: boolean;
}

@Injectable()
export class AgentConfigService {
  constructor(private drizzle: DrizzleService) {}

  async listAll(): Promise<AiAgentConfig[]> {
    return this.drizzle.db.select().from(aiAgentConfig).orderBy(
      asc(aiAgentConfig.flowId),
      asc(aiAgentConfig.orchestratorNodeId),
      asc(aiAgentConfig.executionPhase),
      asc(aiAgentConfig.sortOrder),
      asc(aiAgentConfig.label),
    );
  }

  async listByOrchestrator(orchestratorNodeId: string, flowId = "pipeline") {
    return this.drizzle.db
      .select()
      .from(aiAgentConfig)
      .where(
        and(
          eq(aiAgentConfig.flowId, flowId),
          eq(aiAgentConfig.orchestratorNodeId, orchestratorNodeId),
        ),
      )
      .orderBy(
        asc(aiAgentConfig.executionPhase),
        asc(aiAgentConfig.sortOrder),
        asc(aiAgentConfig.label),
      );
  }

  async getEnabled(orchestratorNodeId: string, flowId = "pipeline") {
    return this.drizzle.db
      .select()
      .from(aiAgentConfig)
      .where(
        and(
          eq(aiAgentConfig.flowId, flowId),
          eq(aiAgentConfig.orchestratorNodeId, orchestratorNodeId),
          eq(aiAgentConfig.enabled, true),
        ),
      )
      .orderBy(
        asc(aiAgentConfig.executionPhase),
        asc(aiAgentConfig.sortOrder),
        asc(aiAgentConfig.label),
      );
  }

  async getExecutableByOrchestrator(orchestratorNodeId: string, flowId = "pipeline") {
    return this.drizzle.db
      .select({
        config: aiAgentConfig,
        promptKey: aiPromptDefinition.key,
      })
      .from(aiAgentConfig)
      .leftJoin(
        aiPromptDefinition,
        eq(aiAgentConfig.promptDefinitionId, aiPromptDefinition.id),
      )
      .where(
        and(
          eq(aiAgentConfig.flowId, flowId),
          eq(aiAgentConfig.orchestratorNodeId, orchestratorNodeId),
          eq(aiAgentConfig.enabled, true),
        ),
      )
      .orderBy(
        asc(aiAgentConfig.executionPhase),
        asc(aiAgentConfig.sortOrder),
        asc(aiAgentConfig.label),
      );
  }

  async create(
    flowId: string,
    orchestratorNodeId: string,
    adminId: string,
    input: CreateAgentConfigInput,
  ) {
    this.assertAgentKey(input.agentKey);

    const promptDefinition = await this.getOrCreateCustomPromptDefinition(
      flowId,
      orchestratorNodeId,
      input.agentKey,
      input.label,
      input.description,
    );

    const [created] = await this.drizzle.db
      .insert(aiAgentConfig)
      .values({
        flowId,
        orchestratorNodeId,
        agentKey: input.agentKey,
        label: input.label,
        description: input.description,
        kind: "prompt",
        enabled: true,
        promptDefinitionId: promptDefinition.id,
        executionPhase: input.executionPhase ?? 1,
        dependsOn: input.dependsOn ?? [],
        sortOrder: input.sortOrder ?? 0,
        isCustom: true,
        createdBy: adminId,
      })
      .returning();

    return created;
  }

  async update(
    flowId: string,
    orchestratorNodeId: string,
    agentKey: string,
    input: UpdateAgentConfigInput,
  ) {
    const [existing] = await this.drizzle.db
      .select()
      .from(aiAgentConfig)
      .where(
        and(
          eq(aiAgentConfig.flowId, flowId),
          eq(aiAgentConfig.orchestratorNodeId, orchestratorNodeId),
          eq(aiAgentConfig.agentKey, agentKey),
        ),
      )
      .limit(1);

    if (!existing) {
      throw new NotFoundException(`Agent config not found: ${flowId}/${orchestratorNodeId}/${agentKey}`);
    }

    const [updated] = await this.drizzle.db
      .update(aiAgentConfig)
      .set({
        label: input.label ?? existing.label,
        description: input.description ?? existing.description,
        executionPhase: input.executionPhase ?? existing.executionPhase,
        dependsOn: input.dependsOn ?? existing.dependsOn,
        sortOrder: input.sortOrder ?? existing.sortOrder,
        enabled: input.enabled ?? existing.enabled,
        updatedAt: new Date(),
      })
      .where(eq(aiAgentConfig.id, existing.id))
      .returning();

    return updated;
  }

  async toggleEnabled(
    flowId: string,
    orchestratorNodeId: string,
    agentKey: string,
  ) {
    const [existing] = await this.drizzle.db
      .select()
      .from(aiAgentConfig)
      .where(
        and(
          eq(aiAgentConfig.flowId, flowId),
          eq(aiAgentConfig.orchestratorNodeId, orchestratorNodeId),
          eq(aiAgentConfig.agentKey, agentKey),
        ),
      )
      .limit(1);

    if (!existing) {
      throw new NotFoundException(`Agent config not found: ${flowId}/${orchestratorNodeId}/${agentKey}`);
    }

    const [updated] = await this.drizzle.db
      .update(aiAgentConfig)
      .set({
        enabled: !existing.enabled,
        updatedAt: new Date(),
      })
      .where(eq(aiAgentConfig.id, existing.id))
      .returning();

    return updated;
  }

  async delete(flowId: string, orchestratorNodeId: string, agentKey: string) {
    const [existing] = await this.drizzle.db
      .select()
      .from(aiAgentConfig)
      .where(
        and(
          eq(aiAgentConfig.flowId, flowId),
          eq(aiAgentConfig.orchestratorNodeId, orchestratorNodeId),
          eq(aiAgentConfig.agentKey, agentKey),
        ),
      )
      .limit(1);

    if (!existing) {
      throw new NotFoundException(`Agent config not found: ${flowId}/${orchestratorNodeId}/${agentKey}`);
    }

    if (!existing.isCustom) {
      throw new BadRequestException("Only custom agents can be deleted");
    }

    await this.drizzle.db.delete(aiAgentConfig).where(eq(aiAgentConfig.id, existing.id));
    return { success: true };
  }

  async seedFromFlowCatalog(): Promise<{ inserted: number; skipped: number }> {
    const pipelineFlow = AI_FLOW_DEFINITIONS.find((flow) => flow.id === "pipeline");
    if (!pipelineFlow) {
      return { inserted: 0, skipped: 0 };
    }

    const orchestrators = ["research_orchestrator", "evaluation_orchestrator"] as const;
    let inserted = 0;
    let skipped = 0;

    for (const orchestratorNodeId of orchestrators) {
      const childEdges = pipelineFlow.edges.filter((edge) => edge.from === orchestratorNodeId);
      for (const edge of childEdges) {
        const childNode = pipelineFlow.nodes.find((node) => node.id === edge.to);
        if (!childNode || childNode.kind !== "prompt") {
          continue;
        }

        const agentKey = this.extractAgentKey(orchestratorNodeId, childNode.id);
        const [existing] = await this.drizzle.db
          .select({ id: aiAgentConfig.id })
          .from(aiAgentConfig)
          .where(
            and(
              eq(aiAgentConfig.flowId, "pipeline"),
              eq(aiAgentConfig.orchestratorNodeId, orchestratorNodeId),
              eq(aiAgentConfig.agentKey, agentKey),
            ),
          )
          .limit(1);

        if (existing) {
          skipped += 1;
          continue;
        }

        const promptKey = childNode.promptKeys[0];
        const [definition] = promptKey
          ? await this.drizzle.db
              .select({ id: aiPromptDefinition.id })
              .from(aiPromptDefinition)
              .where(eq(aiPromptDefinition.key, promptKey))
              .limit(1)
          : [];

        await this.drizzle.db.insert(aiAgentConfig).values({
          flowId: "pipeline",
          orchestratorNodeId,
          agentKey,
          label: childNode.label,
          description: childNode.description,
          kind: childNode.kind,
          enabled: true,
          promptDefinitionId: definition?.id,
          executionPhase:
            orchestratorNodeId === "research_orchestrator" && childNode.id === "research_competitor"
              ? 2
              : 1,
          dependsOn:
            childNode.id === "research_competitor"
              ? ["market", "product"]
              : [],
          sortOrder: inserted,
          isCustom: false,
        });
        inserted += 1;
      }
    }

    return { inserted, skipped };
  }

  private extractAgentKey(orchestratorNodeId: string, nodeId: string): string {
    if (orchestratorNodeId === "research_orchestrator") {
      return nodeId.replace(/^research_/, "");
    }
    if (orchestratorNodeId === "evaluation_orchestrator") {
      return nodeId.replace(/^evaluation_/, "").replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
    }
    return nodeId;
  }

  private assertAgentKey(key: string): void {
    if (!/^[a-zA-Z][a-zA-Z0-9_-]{1,119}$/.test(key)) {
      throw new BadRequestException("agentKey must be alphanumeric and 2-120 chars");
    }
  }

  private async getOrCreateCustomPromptDefinition(
    flowId: string,
    orchestratorNodeId: string,
    agentKey: string,
    label: string,
    description?: string,
  ) {
    const promptKey = `custom.${flowId}.${orchestratorNodeId}.${agentKey}`;
    const [existing] = await this.drizzle.db
      .select()
      .from(aiPromptDefinition)
      .where(eq(aiPromptDefinition.key, promptKey))
      .limit(1);

    if (existing) {
      return existing;
    }

    const [created] = await this.drizzle.db
      .insert(aiPromptDefinition)
      .values({
        key: promptKey,
        displayName: label,
        description: description ?? `Custom agent for ${orchestratorNodeId}`,
        surface: "pipeline",
      })
      .returning();

    return created;
  }
}
