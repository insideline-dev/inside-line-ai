import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { and, desc, eq, isNull, max, or } from "drizzle-orm";
import { DrizzleService } from "../../../database";
import { StartupStage } from "../../startup/entities/startup.schema";
import {
  AI_PROMPT_CATALOG,
  isAiPromptKey,
  type AiPromptKey,
} from "./ai-prompt-catalog";
import {
  aiAgentSchemaRevision,
  aiPromptDefinition,
  type AiPromptDefinition,
} from "../entities";
import type { SchemaDescriptor } from "../interfaces/schema.interface";
import { SchemaCompilerService } from "./schema-compiler.service";
import {
  ExtractionSchema,
  MarketEvaluationSchema,
  ProductEvaluationSchema,
  TeamEvaluationSchema,
  TractionEvaluationSchema,
  BusinessModelEvaluationSchema,
  GtmEvaluationSchema,
  FinancialsEvaluationSchema,
  CompetitiveAdvantageEvaluationSchema,
  LegalEvaluationSchema,
  DealTermsEvaluationSchema,
  ExitPotentialEvaluationSchema,
  TeamResearchSchema,
  MarketResearchSchema,
  ProductResearchSchema,
  NewsResearchSchema,
  CompetitorResearchSchema,
  SynthesisSchema,
} from "../schemas";
import { AiConfigService } from "./ai-config.service";
import { z } from "zod";

export interface CreateSchemaDraftInput {
  schemaJson: SchemaDescriptor;
  notes?: string;
  stage?: StartupStage | null;
}

export interface UpdateSchemaDraftInput {
  schemaJson?: SchemaDescriptor;
  notes?: string;
}

const CODE_SCHEMA_BY_PROMPT_KEY: Partial<Record<AiPromptKey, z.ZodObject<z.ZodRawShape>>> = {
  "extraction.fields": ExtractionSchema,
  "research.team": TeamResearchSchema,
  "research.market": MarketResearchSchema,
  "research.product": ProductResearchSchema,
  "research.news": NewsResearchSchema,
  "research.competitor": CompetitorResearchSchema,
  "evaluation.team": TeamEvaluationSchema,
  "evaluation.market": MarketEvaluationSchema,
  "evaluation.product": ProductEvaluationSchema,
  "evaluation.traction": TractionEvaluationSchema,
  "evaluation.businessModel": BusinessModelEvaluationSchema,
  "evaluation.gtm": GtmEvaluationSchema,
  "evaluation.financials": FinancialsEvaluationSchema,
  "evaluation.competitiveAdvantage": CompetitiveAdvantageEvaluationSchema,
  "evaluation.legal": LegalEvaluationSchema,
  "evaluation.dealTerms": DealTermsEvaluationSchema,
  "evaluation.exitPotential": ExitPotentialEvaluationSchema,
  "synthesis.final": SynthesisSchema,
};

@Injectable()
export class AgentSchemaRegistryService {
  constructor(
    private drizzle: DrizzleService,
    private schemaCompiler: SchemaCompilerService,
    private aiConfig: AiConfigService,
  ) {}

  async listRevisionsByKey(key: AiPromptKey | string) {
    const definition = await this.getOrCreateDefinition(key);

    const revisions = await this.drizzle.db
      .select()
      .from(aiAgentSchemaRevision)
      .where(eq(aiAgentSchemaRevision.definitionId, definition.id))
      .orderBy(desc(aiAgentSchemaRevision.createdAt));

    return { definition, revisions };
  }

  async getPublished(key: AiPromptKey | string, stage?: StartupStage | string | null) {
    const definition = await this.getOrCreateDefinition(key);
    const normalizedStage = this.normalizeStage(stage);
    return this.findPublishedDescriptor(definition.id, normalizedStage);
  }

  async createDraft(
    key: AiPromptKey | string,
    adminId: string,
    input: CreateSchemaDraftInput,
  ) {
    const definition = await this.getOrCreateDefinition(key);
    const stage = this.normalizeStage(input.stage);
    this.assertDescriptor(input.schemaJson);

    const [maxRow] = await this.drizzle.db
      .select({ value: max(aiAgentSchemaRevision.version) })
      .from(aiAgentSchemaRevision)
      .where(
        and(
          eq(aiAgentSchemaRevision.definitionId, definition.id),
          stage === null
            ? isNull(aiAgentSchemaRevision.stage)
            : eq(aiAgentSchemaRevision.stage, stage),
        ),
      );

    const [created] = await this.drizzle.db
      .insert(aiAgentSchemaRevision)
      .values({
        definitionId: definition.id,
        stage,
        status: "draft",
        schemaJson: input.schemaJson,
        notes: input.notes,
        version: (maxRow?.value ?? 0) + 1,
        createdBy: adminId,
      })
      .returning();

    return created;
  }

  async updateDraft(
    key: AiPromptKey | string,
    revisionId: string,
    input: UpdateSchemaDraftInput,
  ) {
    const definition = await this.getOrCreateDefinition(key);

    const [existing] = await this.drizzle.db
      .select()
      .from(aiAgentSchemaRevision)
      .where(
        and(
          eq(aiAgentSchemaRevision.id, revisionId),
          eq(aiAgentSchemaRevision.definitionId, definition.id),
        ),
      )
      .limit(1);

    if (!existing) {
      throw new NotFoundException(
        `Schema revision ${revisionId} not found for prompt key ${key}`,
      );
    }

    if (existing.status !== "draft") {
      throw new BadRequestException("Only draft schema revisions can be edited");
    }

    if (input.schemaJson) {
      this.assertDescriptor(input.schemaJson);
    }

    const [updated] = await this.drizzle.db
      .update(aiAgentSchemaRevision)
      .set({
        schemaJson: input.schemaJson ?? existing.schemaJson,
        notes: input.notes ?? existing.notes,
        updatedAt: new Date(),
      })
      .where(eq(aiAgentSchemaRevision.id, revisionId))
      .returning();

    return updated;
  }

  async publishRevision(key: AiPromptKey | string, revisionId: string, adminId: string) {
    const definition = await this.getOrCreateDefinition(key);

    const published = await this.drizzle.db.transaction(async (tx) => {
      const [draft] = await tx
        .select()
        .from(aiAgentSchemaRevision)
        .where(
          and(
            eq(aiAgentSchemaRevision.id, revisionId),
            eq(aiAgentSchemaRevision.definitionId, definition.id),
          ),
        )
        .limit(1);

      if (!draft) {
        throw new NotFoundException(
          `Schema revision ${revisionId} not found for prompt key ${key}`,
        );
      }

      if (draft.status !== "draft") {
        throw new BadRequestException("Only draft schema revisions can be published");
      }

      this.assertDescriptor(draft.schemaJson as SchemaDescriptor);

      await tx
        .update(aiAgentSchemaRevision)
        .set({
          status: "archived",
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(aiAgentSchemaRevision.definitionId, definition.id),
            eq(aiAgentSchemaRevision.status, "published"),
            draft.stage === null
              ? isNull(aiAgentSchemaRevision.stage)
              : eq(aiAgentSchemaRevision.stage, draft.stage),
          ),
        );

      const [row] = await tx
        .update(aiAgentSchemaRevision)
        .set({
          status: "published",
          publishedBy: adminId,
          publishedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(aiAgentSchemaRevision.id, revisionId))
        .returning();

      return row;
    });

    return published;
  }

  async resolveSchema(
    key: AiPromptKey | string,
    stage?: StartupStage | string | null,
  ): Promise<z.ZodObject<Record<string, z.ZodTypeAny>>> {
    const descriptor = await this.resolveDescriptor(key, stage);
    return this.schemaCompiler.compile(descriptor);
  }

  async resolveDescriptor(
    key: AiPromptKey | string,
    stage?: StartupStage | string | null,
  ): Promise<SchemaDescriptor> {
    if (!this.aiConfig.isPromptRuntimeConfigEnabled() && isAiPromptKey(key)) {
      return this.resolveCodeDescriptor(key);
    }

    const definition = await this.getDefinitionByKey(key);
    if (!definition) {
      if (isAiPromptKey(key)) {
        return this.resolveCodeDescriptor(key);
      }

      throw new NotFoundException(`No schema definition found for prompt key ${key}`);
    }

    const normalizedStage = this.normalizeStage(stage);
    const published = await this.findPublishedDescriptor(definition.id, normalizedStage);

    if (published) {
      this.assertDescriptor(published);
      return published;
    }

    if (isAiPromptKey(key)) {
      return this.resolveCodeDescriptor(key);
    }

    throw new NotFoundException(
      `No published schema revision found for custom prompt key ${key}`,
    );
  }

  private async findPublishedDescriptor(
    definitionId: string,
    stage: StartupStage | null,
  ): Promise<SchemaDescriptor | null> {
    const candidates = await this.drizzle.db
      .select({
        stage: aiAgentSchemaRevision.stage,
        schemaJson: aiAgentSchemaRevision.schemaJson,
      })
      .from(aiAgentSchemaRevision)
      .where(
        and(
          eq(aiAgentSchemaRevision.definitionId, definitionId),
          eq(aiAgentSchemaRevision.status, "published"),
          stage
            ? or(eq(aiAgentSchemaRevision.stage, stage), isNull(aiAgentSchemaRevision.stage))
            : isNull(aiAgentSchemaRevision.stage),
        ),
      )
      .orderBy(
        desc(aiAgentSchemaRevision.stage),
        desc(aiAgentSchemaRevision.publishedAt),
        desc(aiAgentSchemaRevision.createdAt),
      );

    const stageMatch = stage
      ? candidates.find((candidate) => candidate.stage === stage)
      : null;
    const globalMatch = candidates.find((candidate) => candidate.stage === null);
    const selected = stageMatch ?? globalMatch;

    return (selected?.schemaJson as SchemaDescriptor | undefined) ?? null;
  }

  private resolveCodeDescriptor(key: AiPromptKey): SchemaDescriptor {
    const schema = CODE_SCHEMA_BY_PROMPT_KEY[key];
    if (!schema) {
      throw new NotFoundException(`No code schema registered for prompt key ${key}`);
    }

    return this.schemaCompiler.serialize(schema);
  }

  private assertDescriptor(descriptor: SchemaDescriptor): void {
    const validation = this.schemaCompiler.validate(descriptor);
    if (!validation.valid) {
      throw new BadRequestException(
        `Invalid schema descriptor: ${validation.errors.join(", ")}`,
      );
    }
  }

  private normalizeStage(value?: StartupStage | string | null): StartupStage | null {
    if (!value) {
      return null;
    }

    const normalized = String(value).trim().toLowerCase().replace(/-/g, "_");
    if (Object.values(StartupStage).includes(normalized as StartupStage)) {
      return normalized as StartupStage;
    }

    return null;
  }

  private async getOrCreateDefinition(
    key: AiPromptKey | string,
  ): Promise<AiPromptDefinition> {
    if (!isAiPromptKey(key)) {
      const existingCustom = await this.getDefinitionByKey(key);
      if (existingCustom) {
        return existingCustom;
      }

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

  private async getDefinitionByKey(
    key: string,
  ): Promise<AiPromptDefinition | null> {
    const [definition] = await this.drizzle.db
      .select()
      .from(aiPromptDefinition)
      .where(eq(aiPromptDefinition.key, key))
      .limit(1);

    return definition ?? null;
  }
}
