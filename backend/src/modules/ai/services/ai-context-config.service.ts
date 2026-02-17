import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, desc, eq, isNull, max, or } from "drizzle-orm";
import { DrizzleService } from "../../../database";
import {
  aiContextConfigRevision,
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
  AiContextConfigSchema,
  DEFAULT_CONTEXT_CONFIG,
  type AiContextConfig,
} from "./ai-runtime-config.schema";
import { AiConfigService } from "./ai-config.service";

export interface CreateContextConfigDraftInput {
  stage?: StartupStage | null;
  configJson: AiContextConfig;
  notes?: string;
}

export interface UpdateContextConfigDraftInput {
  configJson?: AiContextConfig;
  notes?: string;
}

export type ResolvedContextConfigSource =
  | "default"
  | "published"
  | "revision_override";

export interface ResolvedContextConfig {
  source: ResolvedContextConfigSource;
  revisionId: string | null;
  stage: StartupStage | null;
  config: Required<
    Pick<
      AiContextConfig,
      "includePaths" | "contextJsonFormat" | "contextSectionsWrapper"
    >
  > &
    Pick<AiContextConfig, "sectionOrder">;
}

@Injectable()
export class AiContextConfigService {
  constructor(
    private drizzle: DrizzleService,
    private aiConfig: AiConfigService,
  ) {}

  async listRevisionsByKey(key: string) {
    const definition = await this.getOrCreateDefinition(key);

    const revisions = await this.drizzle.db
      .select()
      .from(aiContextConfigRevision)
      .where(eq(aiContextConfigRevision.definitionId, definition.id))
      .orderBy(desc(aiContextConfigRevision.createdAt));

    return {
      definition,
      revisions,
      defaultConfig: DEFAULT_CONTEXT_CONFIG,
    };
  }

  async createDraft(
    key: string,
    adminId: string,
    input: CreateContextConfigDraftInput,
  ) {
    const definition = await this.getOrCreateDefinition(key);
    const stage = this.normalizeStage(input.stage);
    const parsedConfig = this.parseContextConfig(input.configJson, key);

    const [maxRow] = await this.drizzle.db
      .select({ value: max(aiContextConfigRevision.version) })
      .from(aiContextConfigRevision)
      .where(
        and(
          eq(aiContextConfigRevision.definitionId, definition.id),
          stage === null
            ? isNull(aiContextConfigRevision.stage)
            : eq(aiContextConfigRevision.stage, stage),
        ),
      );

    const [created] = await this.drizzle.db
      .insert(aiContextConfigRevision)
      .values({
        definitionId: definition.id,
        stage,
        status: "draft",
        configJson: parsedConfig,
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
    input: UpdateContextConfigDraftInput,
  ) {
    const definition = await this.getOrCreateDefinition(key);

    const [existing] = await this.drizzle.db
      .select()
      .from(aiContextConfigRevision)
      .where(
        and(
          eq(aiContextConfigRevision.id, revisionId),
          eq(aiContextConfigRevision.definitionId, definition.id),
        ),
      )
      .limit(1);

    if (!existing) {
      throw new NotFoundException(
        `Context config revision ${revisionId} not found for ${key}`,
      );
    }

    if (existing.status !== "draft") {
      throw new BadRequestException("Only draft revisions can be edited");
    }

    const nextConfig = input.configJson
      ? this.parseContextConfig(input.configJson, key)
      : this.parseContextConfig(existing.configJson, key);

    const [updated] = await this.drizzle.db
      .update(aiContextConfigRevision)
      .set({
        configJson: nextConfig,
        notes: input.notes ?? existing.notes,
        updatedAt: new Date(),
      })
      .where(eq(aiContextConfigRevision.id, revisionId))
      .returning();

    return updated;
  }

  async publishRevision(key: string, revisionId: string, adminId: string) {
    const definition = await this.getOrCreateDefinition(key);

    const published = await this.drizzle.db.transaction(async (tx) => {
      const [draft] = await tx
        .select()
        .from(aiContextConfigRevision)
        .where(
          and(
            eq(aiContextConfigRevision.id, revisionId),
            eq(aiContextConfigRevision.definitionId, definition.id),
          ),
        )
        .limit(1);

      if (!draft) {
        throw new NotFoundException(
          `Context config revision ${revisionId} not found for ${key}`,
        );
      }

      if (draft.status !== "draft") {
        throw new BadRequestException("Only draft revisions can be published");
      }

      await tx
        .update(aiContextConfigRevision)
        .set({
          status: "archived",
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(aiContextConfigRevision.definitionId, definition.id),
            eq(aiContextConfigRevision.status, "published"),
            draft.stage === null
              ? isNull(aiContextConfigRevision.stage)
              : eq(aiContextConfigRevision.stage, draft.stage),
          ),
        );

      const [row] = await tx
        .update(aiContextConfigRevision)
        .set({
          status: "published",
          publishedBy: adminId,
          publishedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(aiContextConfigRevision.id, revisionId))
        .returning();

      return row;
    });

    return published;
  }

  async resolveConfig(params: {
    key: AiPromptKey;
    stage?: StartupStage | string | null;
    revisionId?: string;
  }): Promise<ResolvedContextConfig> {
    const normalizedStage = this.normalizeStage(params.stage);

    if (params.revisionId) {
      const revision = await this.getRevisionOverride(
        params.key,
        params.revisionId,
      );
      return {
        source: "revision_override",
        revisionId: revision.id,
        stage: normalizedStage,
        config: this.toEffectiveConfig(
          this.parseContextConfig(revision.configJson, params.key),
        ),
      };
    }

    if (!this.aiConfig.isPromptRuntimeConfigEnabled()) {
      return {
        source: "default",
        revisionId: null,
        stage: normalizedStage,
        config: this.toEffectiveConfig(DEFAULT_CONTEXT_CONFIG),
      };
    }

    const [definition] = await this.drizzle.db
      .select({ id: aiPromptDefinition.id })
      .from(aiPromptDefinition)
      .where(eq(aiPromptDefinition.key, params.key))
      .limit(1);

    if (!definition) {
      return {
        source: "default",
        revisionId: null,
        stage: normalizedStage,
        config: this.toEffectiveConfig(DEFAULT_CONTEXT_CONFIG),
      };
    }

    const candidates = await this.drizzle.db
      .select({
        id: aiContextConfigRevision.id,
        stage: aiContextConfigRevision.stage,
        configJson: aiContextConfigRevision.configJson,
      })
      .from(aiContextConfigRevision)
      .where(
        and(
          eq(aiContextConfigRevision.definitionId, definition.id),
          eq(aiContextConfigRevision.status, "published"),
          normalizedStage
            ? or(
                eq(aiContextConfigRevision.stage, normalizedStage),
                isNull(aiContextConfigRevision.stage),
              )
            : isNull(aiContextConfigRevision.stage),
        ),
      )
      .orderBy(
        desc(aiContextConfigRevision.stage),
        desc(aiContextConfigRevision.publishedAt),
        desc(aiContextConfigRevision.createdAt),
      );

    const stageMatch = normalizedStage
      ? candidates.find((candidate) => candidate.stage === normalizedStage)
      : null;
    const globalMatch = candidates.find(
      (candidate) => candidate.stage === null,
    );
    const selected = stageMatch ?? globalMatch;

    if (!selected) {
      return {
        source: "default",
        revisionId: null,
        stage: normalizedStage,
        config: this.toEffectiveConfig(DEFAULT_CONTEXT_CONFIG),
      };
    }

    return {
      source: "published",
      revisionId: selected.id,
      stage: normalizedStage,
      config: this.toEffectiveConfig(
        this.parseContextConfig(selected.configJson, params.key),
      ),
    };
  }

  filterContextObject(
    context: Record<string, unknown>,
    config: Pick<AiContextConfig, "includePaths">,
  ): Record<string, unknown> {
    const includePaths = config.includePaths?.length
      ? config.includePaths
      : DEFAULT_CONTEXT_CONFIG.includePaths;

    if (includePaths.includes("*")) {
      return context;
    }

    const filtered: Record<string, unknown> = {};

    for (const path of includePaths) {
      const value = this.getValueAtPath(context, path);
      if (value === undefined) {
        continue;
      }
      this.setValueAtPath(filtered, path, value);
    }

    return filtered;
  }

  renderContextJson(
    context: Record<string, unknown>,
    config: Pick<AiContextConfig, "contextJsonFormat">,
  ): string {
    const spacing = config.contextJsonFormat === "pretty" ? 2 : undefined;
    return JSON.stringify(context, null, spacing);
  }

  renderContextSections(
    context: Record<string, unknown>,
    config: Pick<AiContextConfig, "sectionOrder" | "contextSectionsWrapper">,
  ): string {
    const orderedKeys = this.orderSectionKeys(context, config.sectionOrder);
    const wrapper =
      config.contextSectionsWrapper ??
      DEFAULT_CONTEXT_CONFIG.contextSectionsWrapper;
    const sections: string[] = [];

    for (const key of orderedKeys) {
      const value = context[key];
      if (value === undefined || value === null) {
        continue;
      }

      if (Array.isArray(value) && value.length === 0) {
        continue;
      }

      const label = key
        .replace(/([A-Z])/g, " $1")
        .replace(/^./, (s) => s.toUpperCase())
        .trim();

      const sectionBody =
        typeof value === "string" ? value : JSON.stringify(value, null, 2);

      if (wrapper === "none") {
        sections.push(`## ${label}\n${sectionBody}`);
      } else {
        sections.push(
          `## ${label}\n<user_provided_data>\n${sectionBody}\n</user_provided_data>`,
        );
      }
    }

    return sections.join("\n\n");
  }

  private orderSectionKeys(
    context: Record<string, unknown>,
    sectionOrder?: string[],
  ): string[] {
    const keys = Object.keys(context);
    if (!sectionOrder || sectionOrder.length === 0) {
      return keys;
    }

    const seen = new Set<string>();
    const ordered: string[] = [];

    for (const key of sectionOrder) {
      if (keys.includes(key) && !seen.has(key)) {
        ordered.push(key);
        seen.add(key);
      }
    }

    for (const key of keys) {
      if (!seen.has(key)) {
        ordered.push(key);
        seen.add(key);
      }
    }

    return ordered;
  }

  private getValueAtPath(
    source: Record<string, unknown>,
    path: string,
  ): unknown {
    const segments = path.split(".").filter(Boolean);
    if (segments.length === 0) {
      return undefined;
    }

    let current: unknown = source;
    for (const segment of segments) {
      if (
        typeof current !== "object" ||
        current === null ||
        !(segment in (current as Record<string, unknown>))
      ) {
        return undefined;
      }
      current = (current as Record<string, unknown>)[segment];
    }

    return current;
  }

  private setValueAtPath(
    target: Record<string, unknown>,
    path: string,
    value: unknown,
  ): void {
    const segments = path.split(".").filter(Boolean);
    if (segments.length === 0) {
      return;
    }

    let cursor: Record<string, unknown> = target;

    for (let index = 0; index < segments.length; index += 1) {
      const segment = segments[index]!;
      const isLeaf = index === segments.length - 1;

      if (isLeaf) {
        cursor[segment] = value;
        return;
      }

      const next = cursor[segment];
      if (typeof next === "object" && next !== null && !Array.isArray(next)) {
        cursor = next as Record<string, unknown>;
        continue;
      }

      cursor[segment] = {};
      cursor = cursor[segment] as Record<string, unknown>;
    }
  }

  private parseContextConfig(input: unknown, key: string): AiContextConfig {
    const parsed = AiContextConfigSchema.safeParse(input);

    if (!parsed.success) {
      throw new BadRequestException(
        `Invalid context config for ${key}: ${parsed.error.issues
          .map((issue) => issue.message)
          .join(", ")}`,
      );
    }

    return parsed.data;
  }

  private toEffectiveConfig(
    input: AiContextConfig,
  ): ResolvedContextConfig["config"] {
    return {
      includePaths:
        input.includePaths?.length > 0
          ? [...new Set(input.includePaths)]
          : DEFAULT_CONTEXT_CONFIG.includePaths,
      sectionOrder:
        input.sectionOrder && input.sectionOrder.length > 0
          ? [...new Set(input.sectionOrder)]
          : undefined,
      contextJsonFormat:
        input.contextJsonFormat ?? DEFAULT_CONTEXT_CONFIG.contextJsonFormat,
      contextSectionsWrapper:
        input.contextSectionsWrapper ??
        DEFAULT_CONTEXT_CONFIG.contextSectionsWrapper,
    };
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
      .from(aiContextConfigRevision)
      .where(
        and(
          eq(aiContextConfigRevision.id, revisionId),
          eq(aiContextConfigRevision.definitionId, definition.id),
        ),
      )
      .limit(1);

    if (!revision) {
      throw new NotFoundException(
        `Context config revision ${revisionId} not found for ${key}`,
      );
    }

    if (revision.status === "archived") {
      throw new BadRequestException(
        "Archived context config revisions cannot be used",
      );
    }

    return revision;
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
