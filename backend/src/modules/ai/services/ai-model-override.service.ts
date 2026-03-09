import { Injectable, Logger, BadRequestException, OnModuleInit } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { DrizzleService } from "../../../database";
import { aiModelOverride } from "../entities/ai-model-override.schema";
import { ModelPurpose } from "../interfaces/pipeline.interface";
import { AI_RUNTIME_ALLOWED_MODEL_NAMES, isOpenAiDeepResearchModel } from "./ai-runtime-config.schema";

@Injectable()
export class AiModelOverrideService implements OnModuleInit {
  private readonly logger = new Logger(AiModelOverrideService.name);
  private cache = new Map<string, string>();

  constructor(private drizzle: DrizzleService) {}

  async onModuleInit() {
    await this.refreshCache();
  }

  private async refreshCache() {
    try {
      const rows = await this.drizzle.db.select().from(aiModelOverride);
      this.cache.clear();
      for (const row of rows) {
        this.cache.set(row.purpose, row.modelName);
      }
    } catch (err) {
      this.logger.warn(`Failed to load model overrides cache: ${err}`);
    }
  }

  getModelNameSync(purpose: string): string | null {
    return this.cache.get(purpose) ?? null;
  }

  async listAll() {
    return this.drizzle.db.select().from(aiModelOverride);
  }

  async getByPurpose(purpose: string): Promise<{ modelName: string; searchMode: string | null } | null> {
    const [row] = await this.drizzle.db
      .select()
      .from(aiModelOverride)
      .where(eq(aiModelOverride.purpose, purpose));
    return row ? { modelName: row.modelName, searchMode: row.searchMode } : null;
  }

  async upsert(purpose: string, modelName: string, adminId: string, searchMode?: string | null) {
    if (!Object.values(ModelPurpose).includes(purpose as ModelPurpose)) {
      throw new BadRequestException(`Invalid purpose: ${purpose}`);
    }

    const allowedModels: readonly string[] = AI_RUNTIME_ALLOWED_MODEL_NAMES;
    if (!allowedModels.includes(modelName)) {
      throw new BadRequestException(
        `Model not allowed: ${modelName}. Allowed: ${allowedModels.join(", ")}`,
      );
    }

    if (isOpenAiDeepResearchModel(modelName) && purpose !== ModelPurpose.RESEARCH) {
      throw new BadRequestException(
        `Deep research models can only be assigned to the "${ModelPurpose.RESEARCH}" purpose`,
      );
    }

    const validSearchModes = ["off", "provider_grounded_search", "brave_tool_search", "provider_and_brave_search"];
    if (searchMode && !validSearchModes.includes(searchMode)) {
      throw new BadRequestException(`Invalid search mode: ${searchMode}. Allowed: ${validSearchModes.join(", ")}`);
    }

    const [row] = await this.drizzle.db
      .insert(aiModelOverride)
      .values({ purpose, modelName, searchMode: searchMode ?? null, updatedBy: adminId })
      .onConflictDoUpdate({
        target: aiModelOverride.purpose,
        set: { modelName, searchMode: searchMode ?? null, updatedBy: adminId, updatedAt: new Date() },
      })
      .returning();

    await this.refreshCache();
    this.logger.log(
      `Model override set: ${purpose} -> ${modelName} (search: ${searchMode ?? "auto"}) by ${adminId}`,
    );
    return row;
  }

  async remove(purpose: string) {
    await this.drizzle.db
      .delete(aiModelOverride)
      .where(eq(aiModelOverride.purpose, purpose));
    await this.refreshCache();
  }
}
