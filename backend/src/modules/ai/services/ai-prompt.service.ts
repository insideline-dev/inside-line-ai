import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { and, desc, eq, isNull, max, or } from "drizzle-orm";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";
import { DrizzleService } from "../../../database";
import {
  aiPromptDefinition,
  aiPromptRevision,
  type AiPromptDefinition,
} from "../entities/ai-prompt.schema";
import { StartupStage } from "../../startup/entities/startup.schema";
import {
  AI_PROMPT_CATALOG,
  AI_PROMPT_KEYS,
  AI_PROMPT_VARIABLE_DEFINITIONS,
  isAiPromptKey,
  type AiPromptKey,
  type PromptVariableDefinition,
} from "./ai-prompt-catalog";
import { AI_FLOW_DEFINITIONS } from "./ai-flow-catalog";

interface ResolvePromptParams {
  key: string;
  stage?: string | null;
}

export interface ResolvedPrompt {
  key: string;
  stage: StartupStage | null;
  systemPrompt: string;
  userPrompt: string;
  source: "db" | "code";
  revisionId: string | null;
}

export interface CreatePromptDraftInput {
  stage?: StartupStage | null;
  systemPrompt: string;
  userPrompt: string;
  notes?: string;
}

export interface UpdatePromptDraftInput {
  systemPrompt?: string;
  userPrompt?: string;
  notes?: string;
}

@Injectable()
export class AiPromptService {
  private readonly logger = new Logger(AiPromptService.name);
  private readonly cache = new Map<string, { expiresAt: number; value: ResolvedPrompt }>();
  private readonly cacheTtlMs = 60_000;
  private readonly promptLibraryRoot = (() => {
    // Backend runs from backend/ dir (cd backend && bun run dev)
    const fromBackendCwd = resolve(process.cwd(), "src/modules/ai/prompts/library");
    if (existsSync(fromBackendCwd)) return fromBackendCwd;
    // Fallback: running from project root
    return resolve(process.cwd(), "backend/src/modules/ai/prompts/library");
  })();
  private readonly stageList = Object.values(StartupStage) as StartupStage[];
  private readonly narrativePurityGuardrail = [
    "## Internal Narrative Guardrail",
    "For all narrative prose fields (feedback, narrativeSummary, memoNarrative, investorMemo sections, founderReport sections):",
    "- Do NOT mention numeric scores, confidence levels, percentages, or any X/100 notation.",
    "- Keep prose qualitative and insight-driven.",
    "- Put quantitative values only in dedicated structured numeric fields.",
  ].join("\n");

  constructor(
    private drizzle: DrizzleService,
    @Optional() private config?: ConfigService,
  ) {}

  async resolve(params: ResolvePromptParams): Promise<ResolvedPrompt> {
    const normalizedStage = this.normalizeStage(params.stage);
    const cacheKey = `${params.key}::${normalizedStage ?? "global"}`;
    const cached = this.cache.get(cacheKey);

    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }

    if (isAiPromptKey(params.key)) {
      const prompt = this.resolvePromptFromFiles(params.key, normalizedStage);
      const resolved: ResolvedPrompt = {
        key: params.key,
        stage: normalizedStage,
        systemPrompt: prompt.systemPrompt,
        userPrompt: prompt.userPrompt,
        source: "code",
        revisionId: null,
      };
      const guardedResolved = this.injectNarrativeGuardrails(resolved);
      this.setCache(cacheKey, guardedResolved);
      return guardedResolved;
    }

    const [definition] = await this.drizzle.db
      .select({ id: aiPromptDefinition.id })
      .from(aiPromptDefinition)
      .where(eq(aiPromptDefinition.key, params.key))
      .limit(1);

    if (!definition) {
      throw new NotFoundException(`Prompt definition not found for key ${params.key}`);
    }

    const candidates = await this.drizzle.db
      .select({
        id: aiPromptRevision.id,
        stage: aiPromptRevision.stage,
        systemPrompt: aiPromptRevision.systemPrompt,
        userPrompt: aiPromptRevision.userPrompt,
      })
      .from(aiPromptRevision)
      .where(
        and(
          eq(aiPromptRevision.definitionId, definition.id),
          eq(aiPromptRevision.status, "published"),
          normalizedStage
            ? or(eq(aiPromptRevision.stage, normalizedStage), isNull(aiPromptRevision.stage))
            : isNull(aiPromptRevision.stage),
        ),
      )
      .orderBy(
        desc(aiPromptRevision.stage),
        desc(aiPromptRevision.publishedAt),
        desc(aiPromptRevision.createdAt),
      );

    const stageMatch = normalizedStage
      ? candidates.find((item) => item.stage === normalizedStage)
      : null;
    const globalMatch = candidates.find((item) => item.stage === null);
    const selected = stageMatch ?? globalMatch;

    if (!selected) {
      throw new NotFoundException(
        `No published prompt revision found for key ${params.key}`,
      );
    }

    const resolved: ResolvedPrompt = {
      key: params.key,
      stage: normalizedStage,
      systemPrompt: selected.systemPrompt,
      userPrompt: selected.userPrompt,
      source: "db",
      revisionId: selected.id,
    };

    const guardedResolved = this.injectNarrativeGuardrails(resolved);
    this.setCache(cacheKey, guardedResolved);
    return guardedResolved;
  }

  async getPromptCoverageAudit(stage?: string | null) {
    const normalizedStage = this.normalizeStage(stage);
    const definitions = await this.listPromptDefinitions();
    const strictModeEnabled = this.isStrictDbModeEnabled();

    return {
      strictModeEnabled,
      stage: normalizedStage,
      items: definitions.map((definition) => {
        const hasPublishedGlobal = Boolean(definition.publishedGlobal);
        const hasPublishedStage = normalizedStage
          ? definition.publishedStages.some((item) => item.stage === normalizedStage)
          : false;
        const wouldFallback = normalizedStage
          ? !hasPublishedStage && !hasPublishedGlobal
          : !hasPublishedGlobal;
        const isCritical = this.isCriticalPipelinePrompt(definition.key);

        return {
          key: definition.key,
          isCritical,
          hasPublishedGlobal,
          hasPublishedStage: normalizedStage ? hasPublishedStage : null,
          wouldFallback,
          strictViolation: strictModeEnabled && isCritical && wouldFallback,
        };
      }),
    };
  }

  renderTemplate(
    template: string,
    variables: Record<string, string | number | null | undefined>,
  ): string {
    const resolveVariable = (_: string, variableName: string) => {
      const value = variables[variableName];
      if (value === null || value === undefined) {
        return "";
      }
      return String(value);
    };

    const doubleBraceRendered = template.replace(
      /{{\s*([a-zA-Z0-9_]+)\s*}}/g,
      resolveVariable,
    );

    return doubleBraceRendered.replace(
      /(?<!{){\s*([a-zA-Z0-9_]+)\s*}(?!})/g,
      resolveVariable,
    );
  }

  async listPromptDefinitions() {
    return AI_PROMPT_KEYS.map((key) => {
      const definitionId = this.createDeterministicUuid(`prompt-definition:${key}`);
      const catalog = AI_PROMPT_CATALOG[key];

      return {
        id: definitionId,
        key,
        displayName: catalog.displayName,
        description: catalog.description,
        surface: catalog.surface,
        createdAt: new Date(0),
        updatedAt: new Date(0),
        publishedGlobal: this.buildPublishedMeta(key, definitionId, null),
        publishedStages: this.stageList
          .filter((stage) => this.hasStageOverride(key, stage))
          .map((stage) => this.buildPublishedMeta(key, definitionId, stage))
          .filter((item): item is NonNullable<typeof item> => item !== null),
        allowedVariables: catalog.allowedVariables,
        requiredVariables: catalog.requiredVariables,
        variableDefinitions: this.getVariableDefinitions(catalog.allowedVariables),
      };
    });
  }

  async getRevisionsByKey(key: string) {
    if (isAiPromptKey(key)) {
      const definitionId = this.createDeterministicUuid(`prompt-definition:${key}`);
      const catalog = AI_PROMPT_CATALOG[key];
      const definition = {
        id: definitionId,
        key,
        displayName: catalog.displayName,
        description: catalog.description,
        surface: catalog.surface,
        createdAt: new Date(0),
        updatedAt: new Date(0),
        publishedGlobal: this.buildPublishedMeta(key, definitionId, null),
        publishedStages: this.stageList
          .filter((stage) => this.hasStageOverride(key, stage))
          .map((stage) => this.buildPublishedMeta(key, definitionId, stage))
          .filter((item): item is NonNullable<typeof item> => item !== null),
      };

      const revisions = [null, ...this.stageList].map((stage, index) => {
        const resolved = this.resolvePromptFromFiles(key, stage);
        const revisionSeed = [
          key,
          stage ?? "global",
          resolved.systemPrompt,
          resolved.userPrompt,
        ].join("::");
        return {
          id: this.createDeterministicUuid(`prompt-revision:${revisionSeed}`),
          definitionId,
          stage,
          status: "published" as const,
          systemPrompt: resolved.systemPrompt,
          userPrompt: resolved.userPrompt,
          notes:
            stage === null
              ? "Resolved from local prompt library (global)."
              : resolved.effectiveStage === stage
                ? `Resolved from local prompt library (${stage}).`
                : `Resolved from local prompt library (fallback to global for ${stage}).`,
          version: index + 1,
          createdBy: null,
          publishedBy: null,
          publishedAt: new Date(0),
          createdAt: new Date(0),
          updatedAt: new Date(0),
        };
      });

      return {
        definition,
        revisions,
        allowedVariables: catalog.allowedVariables,
        requiredVariables: catalog.requiredVariables,
        variableDefinitions: this.getVariableDefinitions(catalog.allowedVariables),
      };
    }

    const definition = await this.getDefinitionOrThrow(key);
    const revisions = await this.drizzle.db
      .select()
      .from(aiPromptRevision)
      .where(eq(aiPromptRevision.definitionId, definition.id))
      .orderBy(desc(aiPromptRevision.createdAt));

    return {
      definition,
      revisions,
      allowedVariables: [],
      requiredVariables: [],
      variableDefinitions: {},
    };
  }

  getFlowGraph() {
    return {
      flows: AI_FLOW_DEFINITIONS,
    };
  }

  async createDraft(key: string, adminId: string, input: CreatePromptDraftInput) {
    if (isAiPromptKey(key)) {
      throw new BadRequestException(
        "Prompt templates are file-backed and read-only. Edit files under backend/src/modules/ai/prompts/library instead.",
      );
    }

    const definition = await this.getOrCreateDefinition(key);

    const stage = this.normalizeStage(input.stage);
    this.validatePromptTemplate(key, input.systemPrompt, input.userPrompt);

    const [maxRow] = await this.drizzle.db
      .select({ value: max(aiPromptRevision.version) })
      .from(aiPromptRevision)
      .where(
        and(
          eq(aiPromptRevision.definitionId, definition.id),
          stage === null ? isNull(aiPromptRevision.stage) : eq(aiPromptRevision.stage, stage),
        ),
      );

    const version = (maxRow?.value ?? 0) + 1;

    const [created] = await this.drizzle.db
      .insert(aiPromptRevision)
      .values({
        definitionId: definition.id,
        stage,
        status: "draft",
        systemPrompt: input.systemPrompt,
        userPrompt: input.userPrompt,
        notes: input.notes,
        version,
        createdBy: adminId,
      })
      .returning();

    this.invalidateKeyCache(definition.key as AiPromptKey);
    return created;
  }

  async updateDraft(
    key: string,
    revisionId: string,
    input: UpdatePromptDraftInput,
  ) {
    if (isAiPromptKey(key)) {
      throw new BadRequestException(
        "Prompt templates are file-backed and read-only. Edit files under backend/src/modules/ai/prompts/library instead.",
      );
    }

    const definition = await this.getDefinitionOrThrow(key);
    const [existing] = await this.drizzle.db
      .select()
      .from(aiPromptRevision)
      .where(
        and(
          eq(aiPromptRevision.id, revisionId),
          eq(aiPromptRevision.definitionId, definition.id),
        ),
      )
      .limit(1);

    if (!existing) {
      throw new NotFoundException(`Prompt revision ${revisionId} not found for ${key}`);
    }

    if (existing.status !== "draft") {
      throw new BadRequestException("Only draft revisions can be edited");
    }

    const nextSystem = input.systemPrompt ?? existing.systemPrompt;
    const nextUser = input.userPrompt ?? existing.userPrompt;
    this.validatePromptTemplate(key, nextSystem, nextUser);

    const [updated] = await this.drizzle.db
      .update(aiPromptRevision)
      .set({
        systemPrompt: nextSystem,
        userPrompt: nextUser,
        notes: input.notes ?? existing.notes,
        updatedAt: new Date(),
      })
      .where(eq(aiPromptRevision.id, revisionId))
      .returning();

    this.invalidateKeyCache(definition.key as AiPromptKey);
    return updated;
  }

  async publishRevision(key: string, revisionId: string, adminId: string) {
    if (isAiPromptKey(key)) {
      throw new BadRequestException(
        "Prompt templates are file-backed and read-only. Edit files under backend/src/modules/ai/prompts/library instead.",
      );
    }

    const definition = await this.getDefinitionOrThrow(key);

    const published = await this.drizzle.db.transaction(async (tx) => {
      const [draft] = await tx
        .select()
        .from(aiPromptRevision)
        .where(
          and(
            eq(aiPromptRevision.id, revisionId),
            eq(aiPromptRevision.definitionId, definition.id),
          ),
        )
        .limit(1);

      if (!draft) {
        throw new NotFoundException(`Prompt revision ${revisionId} not found for ${key}`);
      }

      if (draft.status !== "draft") {
        throw new BadRequestException("Only draft revisions can be published");
      }

      await tx
        .update(aiPromptRevision)
        .set({ status: "archived", updatedAt: new Date() })
        .where(
          and(
            eq(aiPromptRevision.definitionId, definition.id),
            eq(aiPromptRevision.status, "published"),
            draft.stage === null
              ? isNull(aiPromptRevision.stage)
              : eq(aiPromptRevision.stage, draft.stage),
          ),
        );

      const [row] = await tx
        .update(aiPromptRevision)
        .set({
          status: "published",
          publishedBy: adminId,
          publishedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(aiPromptRevision.id, revisionId))
        .returning();

      return row;
    });

    this.invalidateKeyCache(definition.key as AiPromptKey);
    return published;
  }

  async bulkAppendSection(
    _adminId: string,
    _input: { scope: "research_agents" | "evaluation_agents"; section: string },
  ) {
    throw new BadRequestException(
      "Bulk prompt append is disabled. Prompt templates are file-backed and read-only under backend/src/modules/ai/prompts/library.",
    );
  }

  async seedFromCode(_adminId: string) {
    throw new BadRequestException(
      "Seeding prompts in DB is disabled. Prompt templates are file-backed under backend/src/modules/ai/prompts/library.",
    );
  }

  /**
   * Force-reseed: archives all existing published revisions for the given keys
   * (or all keys if none specified), then seeds fresh from the code catalog.
   */
  async reseedFromCode(
    _adminId: string,
    _keys?: AiPromptKey[],
  ) {
    throw new BadRequestException(
      "Re-seeding prompts in DB is disabled. Prompt templates are file-backed under backend/src/modules/ai/prompts/library.",
    );
  }

  private async getDefinitionOrThrow(key: string): Promise<AiPromptDefinition> {
    const definition = await this.getOrCreateDefinition(key);
    return definition;
  }

  private async getOrCreateDefinition(key: string): Promise<AiPromptDefinition> {
    if (!isAiPromptKey(key)) {
      const [customDefinition] = await this.drizzle.db
        .select()
        .from(aiPromptDefinition)
        .where(eq(aiPromptDefinition.key, key))
        .limit(1);

      if (!customDefinition) {
        throw new BadRequestException(`Unsupported prompt key: ${key}`);
      }

      return customDefinition;
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

  private keyToLibrarySegments(key: AiPromptKey): string[] {
    return key
      .split(".")
      .map((segment) =>
        segment
          .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
          .replace(/_/g, "-")
          .toLowerCase(),
      );
  }

  private buildPromptFilePath(
    key: AiPromptKey,
    type: "system" | "user",
    stage: StartupStage | null,
  ): string {
    const stagePath = stage === null ? "global" : join("stages", stage);
    return join(
      this.promptLibraryRoot,
      stagePath,
      ...this.keyToLibrarySegments(key),
      `${type}.md`,
    );
  }

  private readPromptFile(path: string): string | null {
    if (!existsSync(path)) {
      return null;
    }
    return readFileSync(path, "utf8").replace(/\s+$/, "");
  }

  private resolvePromptFromFiles(
    key: AiPromptKey,
    stage: StartupStage | null,
  ): { systemPrompt: string; userPrompt: string; effectiveStage: StartupStage | null } {
    const catalog = AI_PROMPT_CATALOG[key];
    const globalSystem =
      this.readPromptFile(this.buildPromptFilePath(key, "system", null)) ??
      catalog.defaultSystemPrompt;
    const globalUser =
      this.readPromptFile(this.buildPromptFilePath(key, "user", null)) ??
      catalog.defaultUserPrompt;

    if (!stage) {
      return {
        systemPrompt: globalSystem,
        userPrompt: globalUser,
        effectiveStage: null,
      };
    }

    const stageSystem = this.readPromptFile(this.buildPromptFilePath(key, "system", stage));
    const stageUser = this.readPromptFile(this.buildPromptFilePath(key, "user", stage));
    const hasStageOverride = Boolean(stageSystem || stageUser);

    return {
      systemPrompt: stageSystem ?? globalSystem,
      userPrompt: stageUser ?? globalUser,
      effectiveStage: hasStageOverride ? stage : null,
    };
  }

  private hasStageOverride(key: AiPromptKey, stage: StartupStage): boolean {
    return (
      existsSync(this.buildPromptFilePath(key, "system", stage)) ||
      existsSync(this.buildPromptFilePath(key, "user", stage))
    );
  }

  private buildPublishedMeta(
    key: AiPromptKey,
    definitionId: string,
    stage: StartupStage | null,
  ) {
    if (stage !== null && !this.hasStageOverride(key, stage)) {
      return null;
    }

    const resolved = this.resolvePromptFromFiles(key, stage);
    const seed = [key, stage ?? "global", resolved.systemPrompt, resolved.userPrompt].join(
      "::",
    );

    return {
      id: this.createDeterministicUuid(`prompt-meta:${seed}`),
      definitionId,
      stage,
      version: 1,
      publishedAt: new Date(0),
    };
  }

  private createDeterministicUuid(seed: string): string {
    const hex = createHash("sha256").update(seed).digest("hex");
    const v = "5";
    const variant = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
    return [
      hex.slice(0, 8),
      hex.slice(8, 12),
      `${v}${hex.slice(13, 16)}`,
      `${variant}${hex.slice(17, 20)}`,
      hex.slice(20, 32),
    ].join("-");
  }

  private normalizeStage(stage?: string | null): StartupStage | null {
    if (!stage) {
      return null;
    }

    const normalized = String(stage).trim().toLowerCase().replace(/-/g, "_");
    if (Object.values(StartupStage).includes(normalized as StartupStage)) {
      return normalized as StartupStage;
    }

    this.logger.warn(`Ignoring unknown startup stage for prompt resolution: ${stage}`);
    return null;
  }

  private isStrictDbModeEnabled(): boolean {
    return this.config?.get<boolean>("AI_PROMPT_STRICT_DB_REQUIRED", false) ?? false;
  }

  private isCriticalPipelinePrompt(key: string): boolean {
    return (
      key === "synthesis.final" ||
      key.startsWith("evaluation.") ||
      key.startsWith("research.")
    );
  }

  private validatePromptTemplate(
    key: string,
    systemPrompt: string,
    userPrompt: string,
  ): void {
    if (!userPrompt || userPrompt.trim().length === 0) {
      throw new BadRequestException("userPrompt is required");
    }

    if (!isAiPromptKey(key)) {
      return;
    }

    const catalog = AI_PROMPT_CATALOG[key];
    const variables = this.extractTemplateVariables(`${systemPrompt}\n${userPrompt}`);

    const unknownVariables = [...variables].filter(
      (variable) => !catalog.allowedVariables.includes(variable),
    );

    if (unknownVariables.length > 0) {
      throw new BadRequestException(
        `Unknown template variables for ${key}: ${unknownVariables.join(", ")}`,
      );
    }

    const missingRequired = catalog.requiredVariables.filter(
      (required) => !variables.has(required),
    );

    if (missingRequired.length > 0) {
      throw new BadRequestException(
        `Missing required template variables for ${key}: ${missingRequired.join(", ")}`,
      );
    }
  }

  private extractTemplateVariables(input: string): Set<string> {
    const matches = input.matchAll(
      /{{\s*([a-zA-Z0-9_]+)\s*}}|(?<!{){\s*([a-zA-Z0-9_]+)\s*}(?!})/g,
    );
    const variables = new Set<string>();

    for (const match of matches) {
      const variable = match[1] ?? match[2];
      if (variable) {
        variables.add(variable);
      }
    }

    return variables;
  }

  private getVariableDefinitions(
    variableNames: string[],
  ): Record<string, PromptVariableDefinition> {
    const definitions: Record<string, PromptVariableDefinition> = {};

    for (const variableName of variableNames) {
      const known = AI_PROMPT_VARIABLE_DEFINITIONS[variableName];
      definitions[variableName] = known ?? {
        description: "Variable supported by this prompt key.",
        source: "Prompt runtime context builder",
      };
    }

    return definitions;
  }

  private invalidateKeyCache(key: AiPromptKey): void {
    for (const cacheKey of this.cache.keys()) {
      if (cacheKey.startsWith(`${key}::`)) {
        this.cache.delete(cacheKey);
      }
    }
  }

  private injectNarrativeGuardrails(prompt: ResolvedPrompt): ResolvedPrompt {
    if (!this.shouldInjectNarrativeGuardrail(prompt.key)) {
      return prompt;
    }

    if (prompt.systemPrompt.includes("Internal Narrative Guardrail")) {
      return prompt;
    }

    return {
      ...prompt,
      systemPrompt: `${prompt.systemPrompt}\n\n${this.narrativePurityGuardrail}`,
    };
  }

  private shouldInjectNarrativeGuardrail(key: string): boolean {
    if (!isAiPromptKey(key)) {
      return false;
    }

    return AI_PROMPT_CATALOG[key].surface === "pipeline";
  }

  private setCache(cacheKey: string, value: ResolvedPrompt): void {
    this.cache.set(cacheKey, {
      value,
      expiresAt: Date.now() + this.cacheTtlMs,
    });
  }
}
