import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { eq, desc } from "drizzle-orm";
import { DrizzleService } from "../../../database";
import { pipelineFlowConfig } from "../entities/pipeline-flow-config.schema";
import {
  DEFAULT_PIPELINE_CONFIG,
  PipelineConfig,
  validatePipelineConfig,
} from "../orchestrator/pipeline.config";

@Injectable()
export class PipelineFlowConfigService {
  constructor(private drizzle: DrizzleService) {}

  async listAll() {
    const rows = await this.drizzle.db
      .select()
      .from(pipelineFlowConfig)
      .orderBy(desc(pipelineFlowConfig.updatedAt));
    return { data: rows, total: rows.length };
  }

  async getPublished() {
    const [row] = await this.drizzle.db
      .select()
      .from(pipelineFlowConfig)
      .where(eq(pipelineFlowConfig.status, "published"))
      .orderBy(desc(pipelineFlowConfig.publishedAt))
      .limit(1);
    return row ?? null;
  }

  async getById(id: string) {
    const [row] = await this.drizzle.db
      .select()
      .from(pipelineFlowConfig)
      .where(eq(pipelineFlowConfig.id, id));
    if (!row) throw new NotFoundException(`Flow config ${id} not found`);
    return row;
  }

  async createDraft(
    adminId: string,
    data: {
      name: string;
      flowDefinition: Record<string, unknown>;
      pipelineConfig: Record<string, unknown>;
      notes?: string;
    },
  ) {
    const [row] = await this.drizzle.db
      .insert(pipelineFlowConfig)
      .values({
        name: data.name,
        status: "draft",
        flowDefinition: data.flowDefinition,
        pipelineConfig: data.pipelineConfig,
        notes: data.notes,
        createdBy: adminId,
      })
      .returning();
    return row;
  }

  async updateDraft(
    id: string,
    data: {
      name?: string;
      flowDefinition?: Record<string, unknown>;
      pipelineConfig?: Record<string, unknown>;
      notes?: string;
    },
  ) {
    const existing = await this.getById(id);
    if (existing.status !== "draft") {
      throw new BadRequestException("Only draft configs can be updated");
    }

    const [row] = await this.drizzle.db
      .update(pipelineFlowConfig)
      .set(data)
      .where(eq(pipelineFlowConfig.id, id))
      .returning();
    return row;
  }

  async publishDraft(id: string, adminId: string) {
    const existing = await this.getById(id);
    if (existing.status !== "draft") {
      throw new BadRequestException("Only draft configs can be published");
    }

    // Validate pipeline config shape
    try {
      validatePipelineConfig(existing.pipelineConfig as unknown as PipelineConfig);
    } catch (err) {
      throw new BadRequestException(
        `Invalid pipeline config: ${(err as Error).message}`,
      );
    }

    // Archive + publish in a transaction
    const [row] = await this.drizzle.db.transaction(async (tx) => {
      await tx
        .update(pipelineFlowConfig)
        .set({ status: "archived" })
        .where(eq(pipelineFlowConfig.status, "published"));

      return tx
        .update(pipelineFlowConfig)
        .set({
          status: "published",
          publishedBy: adminId,
          publishedAt: new Date(),
          version: existing.version + 1,
        })
        .where(eq(pipelineFlowConfig.id, id))
        .returning();
    });
    return row;
  }

  async archive(id: string) {
    const existing = await this.getById(id);
    if (existing.status === "archived") {
      throw new BadRequestException("Config is already archived");
    }

    const [row] = await this.drizzle.db
      .update(pipelineFlowConfig)
      .set({ status: "archived" })
      .where(eq(pipelineFlowConfig.id, id))
      .returning();
    return row;
  }

  /**
   * Returns the published pipeline config, or falls back to DEFAULT_PIPELINE_CONFIG.
   */
  async getEffectiveConfig(): Promise<PipelineConfig> {
    const published = await this.getPublished();
    if (!published) return DEFAULT_PIPELINE_CONFIG;

    try {
      const config = published.pipelineConfig as unknown as PipelineConfig;
      validatePipelineConfig(config);
      return config;
    } catch {
      return DEFAULT_PIPELINE_CONFIG;
    }
  }
}
