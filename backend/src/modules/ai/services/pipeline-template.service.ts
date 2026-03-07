import { Injectable } from "@nestjs/common";
import { and, desc, eq } from "drizzle-orm";
import { DrizzleService } from "../../../database";
import { aiAgentConfig, pipelineTemplate } from "../entities";
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
    const [flowConfig, agentConfigs] = await Promise.all([
      this.pipelineFlowConfigService.getPublished(),
      this.drizzle.db
        .select()
        .from(aiAgentConfig)
        .where(eq(aiAgentConfig.flowId, flowId))
        .orderBy(aiAgentConfig.executionPhase, aiAgentConfig.sortOrder),
    ]);

    return {
      flowId,
      flowConfig,
      agentConfigs,
      prompts: [],
      models: [],
      schemas: [],
    };
  }
}
