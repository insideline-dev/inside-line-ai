import {
  BadRequestException,
  Injectable,
  Logger,
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
import { AI_FLOW_DEFINITIONS } from "./ai-flow-catalog";
import {
  AiModelConfigSchema,
  isOpenAiDeepResearchModel,
  isResearchPromptKey,
  normalizeRuntimeModelName,
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

export type BulkApplyModelScope =
  | "all_ai_nodes"
  | "research_agents"
  | "evaluation_agents";

export interface BulkApplyModelConfigInput {
  scope: BulkApplyModelScope;
  modelName: AiModelConfig["modelName"];
}

export interface BulkApplyModelConfigResult {
  scope: BulkApplyModelScope;
  modelName: string;
  provider: string;
  appliedKeys: AiPromptKey[];
  publishedRevisionIds: string[];
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
  private readonly logger = new Logger(AiModelConfigService.name);

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

      const parsedModelConfig = this.parseModelConfig({
        modelName: draft.modelName as AiModelConfig["modelName"],
        searchMode: draft.searchMode,
      });
      this.validateModelConfigForKey(
        definition.key as AiPromptKey,
        parsedModelConfig,
      );

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
          modelName: parsedModelConfig.modelName,
          searchMode: parsedModelConfig.searchMode,
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

  async bulkApplyAndPublish(
    adminId: string,
    input: BulkApplyModelConfigInput,
  ): Promise<BulkApplyModelConfigResult> {
    const normalizedModelName = normalizeRuntimeModelName(input.modelName);
    const modelConfig = this.parseModelConfig({
      modelName: normalizedModelName,
      searchMode: "off",
    });
    const provider = resolveProviderForModelName(modelConfig.modelName);
    const keys = this.resolveBulkTargetPromptKeys(input.scope);

    if (keys.length === 0) {
      throw new BadRequestException(
        `No prompt keys found for scope ${input.scope}`,
      );
    }

    const publishedRevisionIds = await this.drizzle.db.transaction(
      async (tx) => {
        const createdRevisionIds: string[] = [];

        for (const key of keys) {
          const searchMode = this.resolvePreferredSearchModeForKey(
            key,
            modelConfig.modelName,
          );
          const parsed = this.parseModelConfig({
            modelName: modelConfig.modelName,
            searchMode,
          });
          this.validateModelConfigForKey(key, parsed);

          const definition = await this.getOrCreateDefinitionWithDb(tx, key);
          const [maxRow] = await tx
            .select({ value: max(aiModelConfigRevision.version) })
            .from(aiModelConfigRevision)
            .where(
              and(
                eq(aiModelConfigRevision.definitionId, definition.id),
                isNull(aiModelConfigRevision.stage),
              ),
            );

          const [created] = await tx
            .insert(aiModelConfigRevision)
            .values({
              definitionId: definition.id,
              stage: null,
              status: "draft",
              modelName: parsed.modelName,
              searchMode: parsed.searchMode,
              notes: `Bulk apply (${input.scope})`,
              version: (maxRow?.value ?? 0) + 1,
              createdBy: adminId,
            })
            .returning();

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
                isNull(aiModelConfigRevision.stage),
              ),
            );

          const [published] = await tx
            .update(aiModelConfigRevision)
            .set({
              status: "published",
              modelName: parsed.modelName,
              searchMode: parsed.searchMode,
              publishedBy: adminId,
              publishedAt: new Date(),
              updatedAt: new Date(),
            })
            .where(eq(aiModelConfigRevision.id, created.id))
            .returning();

          if (!published) {
            throw new BadRequestException(
              `Failed to publish model config for key ${key}`,
            );
          }
          createdRevisionIds.push(published.id);
        }

        return createdRevisionIds;
      },
    );

    return {
      scope: input.scope,
      modelName: modelConfig.modelName,
      provider,
      appliedKeys: keys,
      publishedRevisionIds,
    };
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
        modelName,
      );

      return this.logResolvedConfig(
        params,
        normalizedStage,
        {
          source: "revision_override",
          revisionId: override.id,
          stage: normalizedStage,
          purpose,
          modelName,
          provider,
          searchMode: override.searchMode,
          supportedSearchModes,
        },
      );
    }

    if (!this.aiConfig.isPromptRuntimeConfigEnabled()) {
      return this.logResolvedConfig(
        params,
        normalizedStage,
        this.buildDefaultResolvedConfig(
          params.key,
          normalizedStage,
          purpose,
        ),
      );
    }

    try {
      const [definition] = await this.drizzle.db
        .select({ id: aiPromptDefinition.id })
        .from(aiPromptDefinition)
        .where(eq(aiPromptDefinition.key, params.key))
        .limit(1);

      if (!definition) {
        return this.logResolvedConfig(
          params,
          normalizedStage,
          this.buildDefaultResolvedConfig(
            params.key,
            normalizedStage,
            purpose,
          ),
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
        return this.logResolvedConfig(
          params,
          normalizedStage,
          this.buildDefaultResolvedConfig(
            params.key,
            normalizedStage,
            purpose,
          ),
        );
      }

      const modelConfig = this.parseModelConfig({
        modelName: selected.modelName as AiModelConfig["modelName"],
        searchMode: selected.searchMode,
      });
      this.validateModelConfigForKey(params.key, modelConfig);

      const provider = resolveProviderForModelName(modelConfig.modelName);

      return this.logResolvedConfig(
        params,
        normalizedStage,
        {
          source: "published",
          revisionId: selected.id,
          stage: normalizedStage,
          purpose,
          modelName: modelConfig.modelName,
          provider,
          searchMode: modelConfig.searchMode,
          supportedSearchModes: this.getSupportedSearchModes(
            params.key,
            provider,
            modelConfig.modelName,
          ),
        },
      );
    } catch (error) {
      if (!this.isRuntimeConfigTableUnavailable(error)) {
        throw error;
      }

      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Model config resolution failed for ${params.key} (${normalizedStage ?? "global"}), using default runtime config: ${message}`,
      );
      return this.logResolvedConfig(
        params,
        normalizedStage,
        this.buildDefaultResolvedConfig(
          params.key,
          normalizedStage,
          purpose,
        ),
      );
    }
  }

  private buildDefaultResolvedConfig(
    key: AiPromptKey,
    stage: StartupStage | null,
    purpose: ModelPurpose,
  ): ResolvedModelConfig {
    const modelName = isResearchPromptKey(key)
      ? "gemini-3-flash-preview"
      : this.aiConfig.getModelForPurpose(purpose);
    const provider = resolveProviderForModelName(modelName);
    const supportedSearchModes = this.getSupportedSearchModes(
      key,
      provider,
      modelName,
    );

    return {
      source: "default",
      revisionId: null,
      stage,
      purpose,
      modelName,
      provider,
      searchMode: supportedSearchModes.includes("provider_grounded_search")
        ? "provider_grounded_search"
        : supportedSearchModes.includes("brave_tool_search")
          ? "brave_tool_search"
          : "off",
      supportedSearchModes,
    };
  }

  private getSupportedSearchModes(
    key: AiPromptKey,
    provider: string,
    modelName: string,
  ): AiRuntimeSearchMode[] {
    if (isResearchPromptKey(key)) {
      if (isOpenAiDeepResearchModel(modelName)) {
        return ["off", "provider_grounded_search"];
      }

      if (provider === "google" || provider === "openai") {
        return [
          "off",
          "provider_grounded_search",
          "brave_tool_search",
          "provider_and_brave_search",
        ];
      }

      return ["off", "brave_tool_search"];
    }

    return ["off"];
  }

  private logResolvedConfig(
    params: {
      key: AiPromptKey;
      stage?: StartupStage | string | null;
      revisionId?: string;
    },
    normalizedStage: StartupStage | null,
    resolved: ResolvedModelConfig,
  ): ResolvedModelConfig {
    this.logger.debug(
      `[ModelConfig] Resolved | key=${params.key} | requestedStage=${params.stage ?? "global"} | normalizedStage=${normalizedStage ?? "global"} | runtimeEnabled=${this.aiConfig.isPromptRuntimeConfigEnabled()} | source=${resolved.source} | revisionId=${resolved.revisionId ?? "none"} | model=${resolved.modelName} | provider=${resolved.provider} | searchMode=${resolved.searchMode}`,
    );
    return resolved;
  }

  private validateModelConfigForKey(
    key: AiPromptKey,
    config: AiModelConfig,
  ): void {
    const isResearch = isResearchPromptKey(key);
    const provider = resolveProviderForModelName(config.modelName);
    const isDeepResearchModel = isOpenAiDeepResearchModel(config.modelName);

    if (isDeepResearchModel && !isResearch) {
      throw new BadRequestException(
        `Model ${config.modelName} is only allowed for research prompt keys (${key})`,
      );
    }

    if (!isResearch && config.searchMode !== "off") {
      throw new BadRequestException(
        `searchMode=${config.searchMode} is not allowed for non-research prompt key ${key}`,
      );
    }

    if (
      isDeepResearchModel &&
      (config.searchMode === "brave_tool_search" ||
        config.searchMode === "provider_and_brave_search")
    ) {
      throw new BadRequestException(
        `Model ${config.modelName} does not support Brave search modes`,
      );
    }

    const requiresProviderGroundedSearch =
      config.searchMode === "provider_grounded_search" ||
      config.searchMode === "provider_and_brave_search";

    if (requiresProviderGroundedSearch) {
      if (!isResearch) {
        throw new BadRequestException(
          `Provider grounded search is only allowed for research prompt keys (${key})`,
        );
      }

      if (provider !== "google" && provider !== "openai") {
        throw new BadRequestException(
          `Grounded search requires a Gemini or OpenAI model for ${key}`,
        );
      }
    }

    if (config.searchMode === "brave_tool_search") {
      if (!isResearch) {
        throw new BadRequestException(
          `Brave tool search is only allowed for research prompt keys (${key})`,
        );
      }
    }
  }

  private resolveBulkTargetPromptKeys(scope: BulkApplyModelScope): AiPromptKey[] {
    const pipelineFlow = AI_FLOW_DEFINITIONS.find((flow) => flow.id === "pipeline");
    if (!pipelineFlow) {
      return [];
    }

    const keys = new Set<AiPromptKey>();
    for (const node of pipelineFlow.nodes) {
      for (const promptKey of node.promptKeys) {
        if (!isAiPromptKey(promptKey)) {
          continue;
        }

        if (scope === "research_agents" && !promptKey.startsWith("research.")) {
          continue;
        }
        if (
          scope === "evaluation_agents" &&
          !promptKey.startsWith("evaluation.")
        ) {
          continue;
        }

        keys.add(promptKey);
      }
    }

    return Array.from(keys).sort();
  }

  private resolvePreferredSearchModeForKey(
    key: AiPromptKey,
    modelName: string,
  ): AiRuntimeSearchMode {
    const provider = resolveProviderForModelName(modelName);
    const supportedSearchModes = this.getSupportedSearchModes(
      key,
      provider,
      modelName,
    );

    if (!isResearchPromptKey(key)) {
      return "off";
    }
    if (supportedSearchModes.includes("provider_grounded_search")) {
      return "provider_grounded_search";
    }
    if (supportedSearchModes.includes("brave_tool_search")) {
      return "brave_tool_search";
    }
    return "off";
  }

  private parseModelConfig(input: unknown): AiModelConfig {
    const asRecord =
      input && typeof input === "object" && !Array.isArray(input)
        ? (input as Record<string, unknown>)
        : null;
    const normalizedInput = asRecord
      ? {
          ...asRecord,
          modelName:
            typeof asRecord.modelName === "string"
              ? normalizeRuntimeModelName(asRecord.modelName)
              : asRecord.modelName,
        }
      : input;
    const parsed = AiModelConfigSchema.safeParse(normalizedInput);

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

  private async getOrCreateDefinitionWithDb(
    db: any,
    key: string,
  ): Promise<AiPromptDefinition> {
    if (!isAiPromptKey(key)) {
      throw new BadRequestException(`Unsupported prompt key: ${key}`);
    }

    const [existing] = await db
      .select()
      .from(aiPromptDefinition)
      .where(eq(aiPromptDefinition.key, key))
      .limit(1);

    if (existing) {
      return existing;
    }

    const catalog = AI_PROMPT_CATALOG[key];
    const [created] = await db
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

  private async getOrCreateDefinition(key: string): Promise<AiPromptDefinition> {
    return this.getOrCreateDefinitionWithDb(this.drizzle.db, key);
  }

  private isRuntimeConfigTableUnavailable(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    return /ai_prompt_definitions|ai_model_config_revisions|relation .* does not exist|failed query/i.test(
      message,
    );
  }
}
