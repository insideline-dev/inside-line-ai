import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, desc, eq, isNull, max, or } from "drizzle-orm";
import { DrizzleService } from "../../../database";
import {
  aiModelConfigRevision,
  aiPromptDefinition,
  type AiPromptDefinition,
} from "../entities/ai-prompt.schema";
import { StartupStage } from "../../startup/entities/startup.schema";
import {
  AI_PROMPT_CATALOG,
  isAiPromptKey,
  type AiPromptKey,
} from "./ai-prompt-catalog";
import {
  AiModelConfigSchema,
  isResearchPromptKey,
  resolveModelPurposeForPromptKey,
  resolveProviderForModelName,
  type AiModelConfig,
  type AiRuntimeSearchMode,
} from "./ai-runtime-config.schema";
import { AiConfigService } from "./ai-config.service";
import type { ModelPurpose } from "../interfaces/pipeline.interface";

export interface CreateModelConfigDraftInput {
  stage?: StartupStage | null;
  modelName: AiModelConfig["modelName"];
  searchMode: AiModelConfig["searchMode"];
  notes?: string;
}

export interface UpdateModelConfigDraftInput {
  modelName?: AiModelConfig["modelName"];
  searchMode?: AiModelConfig["searchMode"];
  notes?: string;
}

export type ResolvedModelConfigSource =
  | "default"
  | "published"
  | "revision_override";

export interface ResolvedModelConfig {
  source: ResolvedModelConfigSource;
  revisionId: string | null;
  stage: StartupStage | null;
  purpose: ModelPurpose;
  modelName: string;
  provider: string;
  searchMode: AiRuntimeSearchMode;
  supportedSearchModes: AiRuntimeSearchMode[];
}

@Injectable()
export class AiModelConfigService {
  constructor(
    private drizzle: DrizzleService,
    private aiConfig: AiConfigService,
  ) {}

  async listRevisionsByKey(key: string) {
    const definition = await this.getOrCreateDefinition(key);

    const revisions = await this.drizzle.db
      .select()
      .from(aiModelConfigRevision)
      .where(eq(aiModelConfigRevision.definitionId, definition.id))
      .orderBy(desc(aiModelConfigRevision.createdAt));

    return {
      definition,
      revisions,
    };
  }

  async createDraft(
    key: string,
    adminId: string,
    input: CreateModelConfigDraftInput,
  ) {
    const definition = await this.getOrCreateDefinition(key);
    const stage = this.normalizeStage(input.stage);
    const modelConfig = this.parseModelConfig({
      modelName: input.modelName,
      searchMode: input.searchMode,
    });

    this.validateModelConfigForKey(definition.key as AiPromptKey, modelConfig);

    const [maxRow] = await this.drizzle.db
      .select({ value: max(aiModelConfigRevision.version) })
      .from(aiModelConfigRevision)
      .where(
        and(
          eq(aiModelConfigRevision.definitionId, definition.id),
          stage === null
            ? isNull(aiModelConfigRevision.stage)
            : eq(aiModelConfigRevision.stage, stage),
        ),
      );

    const [created] = await this.drizzle.db
      .insert(aiModelConfigRevision)
      .values({
        definitionId: definition.id,
        stage,
        status: "draft",
        modelName: modelConfig.modelName,
        searchMode: modelConfig.searchMode,
        notes: input.notes,
        version: (maxRow?.value ?? 0) + 1,
        createdBy: adminId,
      })
      .returning();

    return created;
  }

  async updateDraft(
    key: string,
    revisionId: string,
    input: UpdateModelConfigDraftInput,
  ) {
    const definition = await this.getOrCreateDefinition(key);

    const [existing] = await this.drizzle.db
      .select()
      .from(aiModelConfigRevision)
      .where(
        and(
          eq(aiModelConfigRevision.id, revisionId),
          eq(aiModelConfigRevision.definitionId, definition.id),
        ),
      )
      .limit(1);

    if (!existing) {
      throw new NotFoundException(
        `Model config revision ${revisionId} not found for ${key}`,
      );
    }

    if (existing.status !== "draft") {
      throw new BadRequestException("Only draft revisions can be edited");
    }

    const modelConfig = this.parseModelConfig({
      modelName:
        input.modelName ?? (existing.modelName as AiModelConfig["modelName"]),
      searchMode: input.searchMode ?? existing.searchMode,
    });

    this.validateModelConfigForKey(definition.key as AiPromptKey, modelConfig);

    const [updated] = await this.drizzle.db
      .update(aiModelConfigRevision)
      .set({
        modelName: modelConfig.modelName,
        searchMode: modelConfig.searchMode,
        notes: input.notes ?? existing.notes,
        updatedAt: new Date(),
      })
      .where(eq(aiModelConfigRevision.id, revisionId))
      .returning();

    return updated;
  }

  async publishRevision(key: string, revisionId: string, adminId: string) {
    const definition = await this.getOrCreateDefinition(key);

    const published = await this.drizzle.db.transaction(async (tx) => {
      const [draft] = await tx
        .select()
        .from(aiModelConfigRevision)
        .where(
          and(
            eq(aiModelConfigRevision.id, revisionId),
            eq(aiModelConfigRevision.definitionId, definition.id),
          ),
        )
        .limit(1);

      if (!draft) {
        throw new NotFoundException(
          `Model config revision ${revisionId} not found for ${key}`,
        );
      }

      if (draft.status !== "draft") {
        throw new BadRequestException("Only draft revisions can be published");
      }

      this.validateModelConfigForKey(definition.key as AiPromptKey, {
        modelName: draft.modelName as AiModelConfig["modelName"],
        searchMode: draft.searchMode,
      });

      await tx
        .update(aiModelConfigRevision)
        .set({
          status: "archived",
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(aiModelConfigRevision.definitionId, definition.id),
            eq(aiModelConfigRevision.status, "published"),
            draft.stage === null
              ? isNull(aiModelConfigRevision.stage)
              : eq(aiModelConfigRevision.stage, draft.stage),
          ),
        );

      const [row] = await tx
        .update(aiModelConfigRevision)
        .set({
          status: "published",
          publishedBy: adminId,
          publishedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(aiModelConfigRevision.id, revisionId))
        .returning();

      return row;
    });

    return published;
  }

  async archiveRevision(key: string, revisionId: string) {
    const definition = await this.getOrCreateDefinition(key);

    const [existing] = await this.drizzle.db
      .select()
      .from(aiModelConfigRevision)
      .where(
        and(
          eq(aiModelConfigRevision.id, revisionId),
          eq(aiModelConfigRevision.definitionId, definition.id),
        ),
      )
      .limit(1);

    if (!existing) {
      throw new NotFoundException(
        `Model config revision ${revisionId} not found for ${key}`,
      );
    }

    if (existing.status === "published") {
      throw new BadRequestException(
        "Published revisions cannot be archived directly",
      );
    }

    if (existing.status === "archived") {
      return existing;
    }

    const [archived] = await this.drizzle.db
      .update(aiModelConfigRevision)
      .set({
        status: "archived",
        updatedAt: new Date(),
      })
      .where(eq(aiModelConfigRevision.id, revisionId))
      .returning();

    return archived;
  }

  async resolveConfig(params: {
    key: AiPromptKey;
    stage?: StartupStage | string | null;
    revisionId?: string;
  }): Promise<ResolvedModelConfig> {
    const normalizedStage = this.normalizeStage(params.stage);
    const purpose = resolveModelPurposeForPromptKey(params.key);

    if (params.revisionId) {
      const override = await this.getRevisionOverride(
        params.key,
        params.revisionId,
      );
      const modelName = override.modelName;
      const provider = resolveProviderForModelName(modelName);
      const supportedSearchModes = this.getSupportedSearchModes(
        params.key,
        provider,
      );

      return {
        source: "revision_override",
        revisionId: override.id,
        stage: normalizedStage,
        purpose,
        modelName,
        provider,
        searchMode: override.searchMode,
        supportedSearchModes,
      };
    }

    if (!this.aiConfig.isPromptRuntimeConfigEnabled()) {
      return this.buildDefaultResolvedConfig(
        params.key,
        normalizedStage,
        purpose,
      );
    }

    const [definition] = await this.drizzle.db
      .select({ id: aiPromptDefinition.id })
      .from(aiPromptDefinition)
      .where(eq(aiPromptDefinition.key, params.key))
      .limit(1);

    if (!definition) {
      return this.buildDefaultResolvedConfig(
        params.key,
        normalizedStage,
        purpose,
      );
    }

    const candidates = await this.drizzle.db
      .select({
        id: aiModelConfigRevision.id,
        stage: aiModelConfigRevision.stage,
        modelName: aiModelConfigRevision.modelName,
        searchMode: aiModelConfigRevision.searchMode,
      })
      .from(aiModelConfigRevision)
      .where(
        and(
          eq(aiModelConfigRevision.definitionId, definition.id),
          eq(aiModelConfigRevision.status, "published"),
          normalizedStage
            ? or(
                eq(aiModelConfigRevision.stage, normalizedStage),
                isNull(aiModelConfigRevision.stage),
              )
            : isNull(aiModelConfigRevision.stage),
        ),
      )
      .orderBy(
        desc(aiModelConfigRevision.stage),
        desc(aiModelConfigRevision.publishedAt),
        desc(aiModelConfigRevision.createdAt),
      );

    const stageMatch = normalizedStage
      ? candidates.find((candidate) => candidate.stage === normalizedStage)
      : null;
    const globalMatch = candidates.find(
      (candidate) => candidate.stage === null,
    );
    const selected = stageMatch ?? globalMatch;

    if (!selected) {
      return this.buildDefaultResolvedConfig(
        params.key,
        normalizedStage,
        purpose,
      );
    }

    const modelConfig = this.parseModelConfig({
      modelName: selected.modelName as AiModelConfig["modelName"],
      searchMode: selected.searchMode,
    });
    this.validateModelConfigForKey(params.key, modelConfig);

    const provider = resolveProviderForModelName(modelConfig.modelName);

    return {
      source: "published",
      revisionId: selected.id,
      stage: normalizedStage,
      purpose,
      modelName: modelConfig.modelName,
      provider,
      searchMode: modelConfig.searchMode,
      supportedSearchModes: this.getSupportedSearchModes(params.key, provider),
    };
  }

  private buildDefaultResolvedConfig(
    key: AiPromptKey,
    stage: StartupStage | null,
    purpose: ModelPurpose,
  ): ResolvedModelConfig {
    const modelName = this.aiConfig.getModelForPurpose(purpose);
    const provider = resolveProviderForModelName(modelName);
    const supportedSearchModes = this.getSupportedSearchModes(key, provider);

    return {
      source: "default",
      revisionId: null,
      stage,
      purpose,
      modelName,
      provider,
      searchMode: supportedSearchModes.includes("provider_grounded_search")
        ? "provider_grounded_search"
        : "off",
      supportedSearchModes,
    };
  }

  private getSupportedSearchModes(
    key: AiPromptKey,
    provider: string,
  ): AiRuntimeSearchMode[] {
    if (isResearchPromptKey(key) && provider === "google") {
      return ["off", "provider_grounded_search"];
    }

    return ["off"];
  }

  private validateModelConfigForKey(
    key: AiPromptKey,
    config: AiModelConfig,
  ): void {
    const isResearch = isResearchPromptKey(key);
    const provider = resolveProviderForModelName(config.modelName);

    if (!isResearch && config.searchMode !== "off") {
      throw new BadRequestException(
        `searchMode=${config.searchMode} is not allowed for non-research prompt key ${key}`,
      );
    }

    if (config.searchMode === "provider_grounded_search") {
      if (!isResearch) {
        throw new BadRequestException(
          `Grounded search is only allowed for research prompt keys (${key})`,
        );
      }

      if (provider !== "google") {
        throw new BadRequestException(
          `Grounded search requires a Gemini model for ${key}`,
        );
      }
    }
  }

  private parseModelConfig(input: unknown): AiModelConfig {
    const parsed = AiModelConfigSchema.safeParse(input);

    if (!parsed.success) {
      throw new BadRequestException(
        `Invalid model config: ${parsed.error.issues
          .map((issue) => issue.message)
          .join(", ")}`,
      );
    }

    return parsed.data;
  }

  private normalizeStage(
    value?: StartupStage | string | null,
  ): StartupStage | null {
    if (!value) {
      return null;
    }

    const normalized = String(value).trim().toLowerCase().replace(/-/g, "_");
    if (Object.values(StartupStage).includes(normalized as StartupStage)) {
      return normalized as StartupStage;
    }

    return null;
  }

  private async getRevisionOverride(key: AiPromptKey, revisionId: string) {
    const definition = await this.getOrCreateDefinition(key);

    const [revision] = await this.drizzle.db
      .select()
      .from(aiModelConfigRevision)
      .where(
        and(
          eq(aiModelConfigRevision.id, revisionId),
          eq(aiModelConfigRevision.definitionId, definition.id),
        ),
      )
      .limit(1);

    if (!revision) {
      throw new NotFoundException(
        `Model config revision ${revisionId} not found for ${key}`,
      );
    }

    if (revision.status === "archived") {
      throw new BadRequestException(
        "Archived model config revisions cannot be used",
      );
    }

    const parsed = this.parseModelConfig({
      modelName: revision.modelName as AiModelConfig["modelName"],
      searchMode: revision.searchMode,
    });
    this.validateModelConfigForKey(key, parsed);

    return {
      ...revision,
      modelName: parsed.modelName,
      searchMode: parsed.searchMode,
    };
  }

  private async getOrCreateDefinition(
    key: string,
  ): Promise<AiPromptDefinition> {
    if (!isAiPromptKey(key)) {
      throw new BadRequestException(`Unsupported prompt key: ${key}`);
    }

    const [existing] = await this.drizzle.db
      .select()
      .from(aiPromptDefinition)
      .where(eq(aiPromptDefinition.key, key))
      .limit(1);

    if (existing) {
      return existing;
    }

    const catalog = AI_PROMPT_CATALOG[key];
    const [created] = await this.drizzle.db
      .insert(aiPromptDefinition)
      .values({
        key,
        displayName: catalog.displayName,
        description: catalog.description,
        surface: catalog.surface,
      })
      .returning();

    return created;
  }
}
