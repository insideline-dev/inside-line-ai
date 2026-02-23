import { createZodDto } from "nestjs-zod";
import { z } from "zod";
import { AI_PROMPT_KEYS } from "../../ai/services/ai-prompt-catalog";
import { StartupStage } from "../../startup/entities/startup.schema";
import type { SchemaField } from "../../ai/interfaces/schema.interface";

const PromptKeySchema = z.enum(AI_PROMPT_KEYS);
const SchemaRevisionStatusSchema = z.enum(["draft", "published", "archived"]);
const SchemaFieldTypeSchema = z.enum([
  "string",
  "number",
  "boolean",
  "array",
  "object",
  "enum",
]);

const SchemaFieldSchema: z.ZodType<SchemaField> = z.lazy(() =>
  z.object({
    type: SchemaFieldTypeSchema,
    description: z.string().optional(),
    optional: z.boolean().optional(),
    min: z.number().optional(),
    max: z.number().optional(),
    default: z.unknown().optional(),
    items: SchemaFieldSchema.optional(),
    fields: z.record(z.string(), SchemaFieldSchema).optional(),
    values: z.array(z.string()).optional(),
  }),
);

const SchemaDescriptorSchema = z.object({
  type: z.literal("object"),
  fields: z.record(z.string(), SchemaFieldSchema),
});

export const CreateAiSchemaRevisionSchema = z.object({
  schemaJson: SchemaDescriptorSchema,
  notes: z.string().trim().max(4000).optional(),
  stage: z.nativeEnum(StartupStage).nullable().optional(),
});

export const UpdateAiSchemaRevisionSchema = z
  .object({
    schemaJson: SchemaDescriptorSchema.optional(),
    notes: z.string().trim().max(4000).optional(),
  })
  .refine(
    (value) => value.schemaJson !== undefined || value.notes !== undefined,
    { message: "At least one field must be provided" },
  );

const AiSchemaRevisionSchema = z.object({
  id: z.string().uuid(),
  definitionId: z.string().uuid(),
  stage: z.nativeEnum(StartupStage).nullable(),
  status: SchemaRevisionStatusSchema,
  schemaJson: SchemaDescriptorSchema,
  notes: z.string().nullable(),
  version: z.number().int(),
  createdBy: z.string().uuid().nullable(),
  publishedBy: z.string().uuid().nullable(),
  publishedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

const AiPromptDefinitionSchema = z.object({
  id: z.string().uuid(),
  key: PromptKeySchema,
  displayName: z.string(),
  description: z.string().nullable(),
  surface: z.enum(["pipeline", "clara"]),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const AiSchemaRevisionsResponseSchema = z.object({
  definition: AiPromptDefinitionSchema,
  revisions: z.array(AiSchemaRevisionSchema),
});

const ResolvedSchemaSourceSchema = z.enum(["published", "code"]);

export const AiResolvedSchemaResponseSchema = z.object({
  promptKey: z.string().min(1),
  stage: z.nativeEnum(StartupStage).nullable(),
  source: ResolvedSchemaSourceSchema,
  schemaJson: SchemaDescriptorSchema,
});

export class CreateAiSchemaRevisionDto extends createZodDto(CreateAiSchemaRevisionSchema) {}
export class UpdateAiSchemaRevisionDto extends createZodDto(UpdateAiSchemaRevisionSchema) {}
export class AiSchemaRevisionResponseDto extends createZodDto(AiSchemaRevisionSchema) {}
export class AiSchemaRevisionsResponseDto extends createZodDto(AiSchemaRevisionsResponseSchema) {}
export class AiResolvedSchemaResponseDto extends createZodDto(AiResolvedSchemaResponseSchema) {}
