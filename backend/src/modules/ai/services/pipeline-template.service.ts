import { Injectable } from "@nestjs/common";
import { and, desc, eq } from "drizzle-orm";
import { DrizzleService } from "../../../database";
import {
  aiAgentConfig,
  aiAgentSchemaRevision,
  aiModelConfigRevision,
  aiPromptDefinition,
  aiPromptRevision,
  pipelineTemplate,
} from "../entities";
import { PipelineFlowConfigService } from "./pipeline-flow-config.service";

@Injectable()
export class PipelineTemplateService {
  constructor(
    private drizzle: DrizzleService,
    private pipelineFlowConfigService: PipelineFlowConfigService,
  ) {}

  async getRuntimeSnapshot(flowId = "pipeline"): Promise<Record<string, unknown>> {
    const [publishedTemplate] = await this.drizzle.db
      .select()
      .from(pipelineTemplate)
      .where(
        and(
          eq(pipelineTemplate.flowId, flowId),
          eq(pipelineTemplate.status, "published"),
        ),
      )
      .orderBy(desc(pipelineTemplate.publishedAt), desc(pipelineTemplate.createdAt))
      .limit(1);

    if (publishedTemplate) {
      return {
        source: "published_template",
        templateId: publishedTemplate.id,
        templateVersion: publishedTemplate.version,
        capturedAt: new Date().toISOString(),
        snapshot: publishedTemplate.snapshot,
      };
    }

    const liveSnapshot = await this.buildLiveSnapshot(flowId);
    return {
      source: "live_published_config",
      capturedAt: new Date().toISOString(),
      snapshot: liveSnapshot,
    };
  }

  private async buildLiveSnapshot(flowId: string): Promise<Record<string, unknown>> {
    const [flowConfig, agentConfigs, promptRevisions, modelRevisions, schemaRevisions] =
      await Promise.all([
        this.pipelineFlowConfigService.getPublished(),
        this.drizzle.db
          .select()
          .from(aiAgentConfig)
          .where(eq(aiAgentConfig.flowId, flowId))
          .orderBy(aiAgentConfig.executionPhase, aiAgentConfig.sortOrder),
        this.drizzle.db
          .select({
            promptKey: aiPromptDefinition.key,
            stage: aiPromptRevision.stage,
            systemPrompt: aiPromptRevision.systemPrompt,
            userPrompt: aiPromptRevision.userPrompt,
            version: aiPromptRevision.version,
          })
          .from(aiPromptRevision)
          .innerJoin(
            aiPromptDefinition,
            eq(aiPromptRevision.definitionId, aiPromptDefinition.id),
          )
          .where(eq(aiPromptRevision.status, "published")),
        this.drizzle.db
          .select({
            promptKey: aiPromptDefinition.key,
            stage: aiModelConfigRevision.stage,
            modelName: aiModelConfigRevision.modelName,
            searchMode: aiModelConfigRevision.searchMode,
            version: aiModelConfigRevision.version,
          })
          .from(aiModelConfigRevision)
          .innerJoin(
            aiPromptDefinition,
            eq(aiModelConfigRevision.definitionId, aiPromptDefinition.id),
          )
          .where(eq(aiModelConfigRevision.status, "published")),
        this.drizzle.db
          .select({
            promptKey: aiPromptDefinition.key,
            stage: aiAgentSchemaRevision.stage,
            schemaJson: aiAgentSchemaRevision.schemaJson,
            version: aiAgentSchemaRevision.version,
          })
          .from(aiAgentSchemaRevision)
          .innerJoin(
            aiPromptDefinition,
            eq(aiAgentSchemaRevision.definitionId, aiPromptDefinition.id),
          )
          .where(eq(aiAgentSchemaRevision.status, "published")),
      ]);

    return {
      flowId,
      flowConfig,
      agentConfigs,
      prompts: promptRevisions,
      models: modelRevisions,
      schemas: schemaRevisions,
    };
  }
}
