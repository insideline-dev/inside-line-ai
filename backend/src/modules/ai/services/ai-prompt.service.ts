import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { and, asc, desc, eq, inArray, isNull, max, or } from "drizzle-orm";
import { DrizzleService } from "../../../database";
import {
  aiPromptDefinition,
  aiPromptRevision,
  type AiPromptDefinition,
} from "../entities/ai-prompt.schema";
import { aiAgentSchemaRevision } from "../entities/ai-agent-schema-revision.schema";
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
import {
  CompetitorResearchObjectSchema,
  DealTermsEvaluationSchema,
  ExitPotentialEvaluationSchema,
  FinancialsEvaluationSchema,
  GtmEvaluationSchema,
  LegalEvaluationSchema,
  MarketEvaluationSchema,
  MarketResearchSchema,
  NewsResearchSchema,
  ProductEvaluationSchema,
  ProductResearchSchema,
  SynthesisSchema,
  TeamEvaluationSchema,
  TeamResearchSchema,
  TractionEvaluationSchema,
  BusinessModelEvaluationSchema,
  CompetitiveAdvantageEvaluationSchema,
} from "../schemas";
import { SchemaCompilerService } from "./schema-compiler.service";
import { z } from "zod";

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
  private readonly schemaCompiler = new SchemaCompilerService();
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

    const fallback = isAiPromptKey(params.key)
      ? this.toCodePrompt(params.key, normalizedStage)
      : null;
    try {
      const [definition] = await this.drizzle.db
        .select({ id: aiPromptDefinition.id })
        .from(aiPromptDefinition)
        .where(eq(aiPromptDefinition.key, params.key))
        .limit(1);

      if (!definition) {
        if (fallback) {
          const guardedFallback = this.resolveCodeFallback({
            key: params.key,
            stage: normalizedStage,
            reason: `Prompt definition not found for key ${params.key}`,
            fallback,
          });
          this.setCache(cacheKey, guardedFallback);
          return guardedFallback;
        }
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
        if (fallback) {
          const guardedFallback = this.resolveCodeFallback({
            key: params.key,
            stage: normalizedStage,
            reason: `No published prompt revision found for key ${params.key}`,
            fallback,
          });
          this.setCache(cacheKey, guardedFallback);
          return guardedFallback;
        }
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
    } catch (error) {
      if (!fallback) {
        throw error;
      }
      const message = error instanceof Error ? error.message : String(error);
      const guardedFallback = this.resolveCodeFallback({
        key: params.key,
        stage: normalizedStage,
        reason: message,
        fallback,
      });
      this.setCache(cacheKey, guardedFallback);
      return guardedFallback;
    }
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
    return template.replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_, variableName: string) => {
      const value = variables[variableName];
      if (value === null || value === undefined) {
        return "";
      }
      return String(value);
    });
  }

  async listPromptDefinitions() {
    await this.ensureDefinitionsExist();

    const definitions = await this.drizzle.db
      .select()
      .from(aiPromptDefinition)
      .orderBy(asc(aiPromptDefinition.key));

    const published = await this.drizzle.db
      .select({
        definitionId: aiPromptRevision.definitionId,
        id: aiPromptRevision.id,
        stage: aiPromptRevision.stage,
        version: aiPromptRevision.version,
        publishedAt: aiPromptRevision.publishedAt,
      })
      .from(aiPromptRevision)
      .where(eq(aiPromptRevision.status, "published"))
      .orderBy(asc(aiPromptRevision.definitionId), asc(aiPromptRevision.stage));

    const publishedByDefinition = new Map<string, typeof published>();
    for (const row of published) {
      const list = publishedByDefinition.get(row.definitionId) ?? [];
      list.push(row);
      publishedByDefinition.set(row.definitionId, list);
    }

    return definitions.map((definition) => {
      const rows = publishedByDefinition.get(definition.id) ?? [];
      const global = rows.find((row) => row.stage === null) ?? null;
      const stages = rows.filter((row) => row.stage !== null);
      const catalog = AI_PROMPT_CATALOG[definition.key as AiPromptKey];

      return {
        ...definition,
        publishedGlobal: global,
        publishedStages: stages,
        allowedVariables: catalog?.allowedVariables ?? [],
        requiredVariables: catalog?.requiredVariables ?? [],
        variableDefinitions: this.getVariableDefinitions(catalog?.allowedVariables ?? []),
      };
    });
  }

  async getRevisionsByKey(key: string) {
    const definition = await this.getDefinitionOrThrow(key);

    const revisions = await this.drizzle.db
      .select()
      .from(aiPromptRevision)
      .where(eq(aiPromptRevision.definitionId, definition.id))
      .orderBy(desc(aiPromptRevision.createdAt));
    const catalog = AI_PROMPT_CATALOG[definition.key as AiPromptKey];

    return {
      definition,
      revisions,
      allowedVariables: catalog?.allowedVariables ?? [],
      requiredVariables: catalog?.requiredVariables ?? [],
      variableDefinitions: this.getVariableDefinitions(catalog?.allowedVariables ?? []),
    };
  }

  getFlowGraph() {
    return {
      flows: AI_FLOW_DEFINITIONS,
    };
  }

  async createDraft(key: string, adminId: string, input: CreatePromptDraftInput) {
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

  async seedFromCode(adminId: string) {
    const stages = Object.values(StartupStage) as StartupStage[];
    const stageTargets: Array<StartupStage | null> = [null, ...stages];
    const insertedByStage = Object.fromEntries(
      stages.map((stage) => [stage, 0]),
    ) as Record<StartupStage, number>;

    let insertedTotal = 0;
    let insertedGlobal = 0;
    let skippedExisting = 0;
    let seededSchemaRevisions = 0;
    let skippedSchemaRevisions = 0;

    try {
      await this.ensureDefinitionsExist();

      for (const key of AI_PROMPT_KEYS) {
        const definition = await this.getOrCreateDefinition(key);
        const catalogEntry = AI_PROMPT_CATALOG[key];

        for (const stage of stageTargets) {
          const [existingPublished] = await this.drizzle.db
            .select({ id: aiPromptRevision.id })
            .from(aiPromptRevision)
            .where(
              and(
                eq(aiPromptRevision.definitionId, definition.id),
                eq(aiPromptRevision.status, "published"),
                stage === null
                  ? isNull(aiPromptRevision.stage)
                  : eq(aiPromptRevision.stage, stage),
              ),
            )
            .limit(1);

          if (existingPublished) {
            skippedExisting += 1;
            continue;
          }

          const [maxRow] = await this.drizzle.db
            .select({ value: max(aiPromptRevision.version) })
            .from(aiPromptRevision)
            .where(
              and(
                eq(aiPromptRevision.definitionId, definition.id),
                stage === null
                  ? isNull(aiPromptRevision.stage)
                  : eq(aiPromptRevision.stage, stage),
              ),
            );

          await this.drizzle.db.insert(aiPromptRevision).values({
            definitionId: definition.id,
            stage,
            status: "published",
            systemPrompt: catalogEntry.defaultSystemPrompt,
            userPrompt: catalogEntry.defaultUserPrompt,
            notes:
              stage === null
                ? "Seeded from code defaults (global)"
                : `Seeded from code defaults (${stage})`,
            version: (maxRow?.value ?? 0) + 1,
            createdBy: adminId,
            publishedBy: adminId,
            publishedAt: new Date(),
          });

          insertedTotal += 1;
          if (stage === null) {
            insertedGlobal += 1;
          } else {
            insertedByStage[stage] += 1;
          }
        }
      }

      const agentSchemaEntries: Array<{
        key: AiPromptKey;
        schema: z.ZodObject<z.ZodRawShape>;
      }> = [
        { key: "research.team", schema: TeamResearchSchema },
        { key: "research.market", schema: MarketResearchSchema },
        { key: "research.product", schema: ProductResearchSchema },
        { key: "research.news", schema: NewsResearchSchema },
        { key: "research.competitor", schema: CompetitorResearchObjectSchema },
        { key: "evaluation.team", schema: TeamEvaluationSchema },
        { key: "evaluation.market", schema: MarketEvaluationSchema },
        { key: "evaluation.product", schema: ProductEvaluationSchema },
        { key: "evaluation.traction", schema: TractionEvaluationSchema },
        { key: "evaluation.businessModel", schema: BusinessModelEvaluationSchema },
        { key: "evaluation.gtm", schema: GtmEvaluationSchema },
        { key: "evaluation.financials", schema: FinancialsEvaluationSchema },
        {
          key: "evaluation.competitiveAdvantage",
          schema: CompetitiveAdvantageEvaluationSchema,
        },
        { key: "evaluation.legal", schema: LegalEvaluationSchema },
        { key: "evaluation.dealTerms", schema: DealTermsEvaluationSchema },
        { key: "evaluation.exitPotential", schema: ExitPotentialEvaluationSchema },
        { key: "synthesis.final", schema: SynthesisSchema },
      ];

      for (const entry of agentSchemaEntries) {
        const definition = await this.getOrCreateDefinition(entry.key);

        const [existingPublished] = await this.drizzle.db
          .select({ id: aiAgentSchemaRevision.id })
          .from(aiAgentSchemaRevision)
          .where(
            and(
              eq(aiAgentSchemaRevision.definitionId, definition.id),
              eq(aiAgentSchemaRevision.status, "published"),
              isNull(aiAgentSchemaRevision.stage),
            ),
          )
          .limit(1);

        if (existingPublished) {
          skippedSchemaRevisions += 1;
          continue;
        }

        const serializedDescriptor = this.schemaCompiler.serialize(entry.schema);
        const compiledFromDescriptor = this.schemaCompiler.compile(serializedDescriptor);
        const roundtripDescriptor = this.schemaCompiler.serialize(compiledFromDescriptor);
        const roundtripValidation = this.schemaCompiler.validate(roundtripDescriptor);

        if (!roundtripValidation.valid) {
          throw new BadRequestException(
            `Schema roundtrip validation failed for ${entry.key}: ${roundtripValidation.errors.join(", ")}`,
          );
        }

        await this.drizzle.db.insert(aiAgentSchemaRevision).values({
          definitionId: definition.id,
          stage: null,
          status: "published",
          schemaJson: serializedDescriptor,
          notes: "Seeded from code defaults (global)",
          version: 1,
          createdBy: adminId,
          publishedBy: adminId,
          publishedAt: new Date(),
        });

        seededSchemaRevisions += 1;
      }
    } catch (error) {
      if (this.isPromptTablesMissingError(error)) {
        throw new BadRequestException(
          "AI prompt tables are missing. Run `cd backend && bun run db:push` and try again.",
        );
      }
      throw error;
    }

    this.cache.clear();
    return {
      insertedTotal,
      insertedGlobal,
      insertedByStage,
      skippedExisting,
      seededSchemaRevisions,
      skippedSchemaRevisions,
      totalPromptKeys: AI_PROMPT_KEYS.length,
      totalTargetSlots: AI_PROMPT_KEYS.length * stageTargets.length,
    };
  }

  /**
   * Force-reseed: archives all existing published revisions for the given keys
   * (or all keys if none specified), then seeds fresh from the code catalog.
   */
  async reseedFromCode(
    adminId: string,
    keys?: AiPromptKey[],
  ) {
    const targetKeys = keys ?? [...AI_PROMPT_KEYS];
    const stages = Object.values(StartupStage) as StartupStage[];
    const stageTargets: Array<StartupStage | null> = [null, ...stages];

    let archived = 0;
    let inserted = 0;

    try {
      await this.ensureDefinitionsExist();

      for (const key of targetKeys) {
        const definition = await this.getOrCreateDefinition(key);
        const catalogEntry = AI_PROMPT_CATALOG[key];

        for (const stage of stageTargets) {
          const stageCondition =
            stage === null
              ? isNull(aiPromptRevision.stage)
              : eq(aiPromptRevision.stage, stage);

          // Archive existing published revisions
          const archivedRows = await this.drizzle.db
            .update(aiPromptRevision)
            .set({ status: "archived", updatedAt: new Date() })
            .where(
              and(
                eq(aiPromptRevision.definitionId, definition.id),
                eq(aiPromptRevision.status, "published"),
                stageCondition,
              ),
            )
            .returning({ id: aiPromptRevision.id });

          archived += archivedRows.length;

          // Get next version number
          const [maxRow] = await this.drizzle.db
            .select({ value: max(aiPromptRevision.version) })
            .from(aiPromptRevision)
            .where(
              and(
                eq(aiPromptRevision.definitionId, definition.id),
                stageCondition,
              ),
            );

          await this.drizzle.db.insert(aiPromptRevision).values({
            definitionId: definition.id,
            stage,
            status: "published",
            systemPrompt: catalogEntry.defaultSystemPrompt,
            userPrompt: catalogEntry.defaultUserPrompt,
            notes:
              stage === null
                ? "Re-seeded from code catalog (global)"
                : `Re-seeded from code catalog (${stage})`,
            version: (maxRow?.value ?? 0) + 1,
            createdBy: adminId,
            publishedBy: adminId,
            publishedAt: new Date(),
          });

          inserted += 1;
        }
      }
    } catch (error) {
      if (this.isPromptTablesMissingError(error)) {
        throw new BadRequestException(
          "AI prompt tables are missing. Run `cd backend && bun run db:push` and try again.",
        );
      }
      throw error;
    }

    this.cache.clear();
    return {
      archived,
      inserted,
      keys: targetKeys,
      stagesPerKey: stageTargets.length,
    };
  }

  private async ensureDefinitionsExist(): Promise<void> {
    const keys = AI_PROMPT_KEYS as unknown as string[];
    const existing = await this.drizzle.db
      .select({ key: aiPromptDefinition.key })
      .from(aiPromptDefinition)
      .where(inArray(aiPromptDefinition.key, keys));

    const existingKeys = new Set(existing.map((row) => row.key));
    const missing = keys.filter((key) => !existingKeys.has(key));
    if (missing.length === 0) {
      return;
    }

    await this.drizzle.db.insert(aiPromptDefinition).values(
      missing.map((key) => {
        const catalog = AI_PROMPT_CATALOG[key as AiPromptKey];
        return {
          key,
          displayName: catalog.displayName,
          description: catalog.description,
          surface: catalog.surface,
        };
      }),
    ).onConflictDoNothing();
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

  private toCodePrompt(
    key: AiPromptKey,
    stage: StartupStage | null,
  ): ResolvedPrompt {
    const catalog = AI_PROMPT_CATALOG[key];
    return {
      key,
      stage,
      systemPrompt: catalog.defaultSystemPrompt,
      userPrompt: catalog.defaultUserPrompt,
      source: "code",
      revisionId: null,
    };
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

  private resolveCodeFallback(input: {
    key: string;
    stage: StartupStage | null;
    reason: string;
    fallback: ResolvedPrompt;
  }): ResolvedPrompt {
    const strictModeEnabled = this.isStrictDbModeEnabled();
    const isCritical = this.isCriticalPipelinePrompt(input.key);
    if (strictModeEnabled && isCritical) {
      throw new NotFoundException(
        `Missing published prompt revision for critical key ${input.key} (${input.stage ?? "global"}) while AI_PROMPT_STRICT_DB_REQUIRED=true`,
      );
    }

    const message =
      `Prompt resolution falling back to code for ${input.key} (${input.stage ?? "global"}): ${input.reason}`;
    if (isCritical) {
      this.logger.error(message);
    } else {
      this.logger.warn(message);
    }
    return this.injectNarrativeGuardrails(input.fallback);
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
    const matches = input.matchAll(/{{\s*([a-zA-Z0-9_]+)\s*}}/g);
    const variables = new Set<string>();

    for (const match of matches) {
      if (match[1]) {
        variables.add(match[1]);
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

  private isPromptTablesMissingError(error: unknown): boolean {
    const code = (error as { code?: string } | undefined)?.code;
    const message = error instanceof Error ? error.message : String(error);

    if (code === "42P01") {
      return true;
    }

    return /ai_prompt_definitions|ai_prompt_revisions|ai_agent_schema_revisions|relation .* does not exist/i.test(
      message,
    );
  }
}
