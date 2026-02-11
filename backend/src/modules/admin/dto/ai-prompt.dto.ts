import { createZodDto } from "nestjs-zod";
import { z } from "zod";
import { AI_PROMPT_KEYS } from "../../ai/services/ai-prompt-catalog";
import { StartupStage } from "../../startup/entities/startup.schema";

const PromptKeySchema = z.enum(AI_PROMPT_KEYS);
const PromptSurfaceSchema = z.enum(["pipeline", "clara"]);
const PromptStatusSchema = z.enum(["draft", "published", "archived"]);
const FlowNodeKindSchema = z.enum(["prompt", "system"]);

export const CreateAiPromptRevisionSchema = z.object({
  stage: z.nativeEnum(StartupStage).nullable().optional(),
  systemPrompt: z.string().min(1),
  userPrompt: z.string().min(1),
  notes: z.string().trim().max(4000).optional(),
});

export const UpdateAiPromptRevisionSchema = z
  .object({
    systemPrompt: z.string().min(1).optional(),
    userPrompt: z.string().min(1).optional(),
    notes: z.string().trim().max(4000).optional(),
  })
  .refine(
    (value) =>
      value.systemPrompt !== undefined ||
      value.userPrompt !== undefined ||
      value.notes !== undefined,
    { message: "At least one field must be provided" },
  );

export const PromptKeyParamSchema = z.object({
  key: PromptKeySchema,
});

const AiPromptRevisionMetaSchema = z.object({
  id: z.string().uuid(),
  stage: z.nativeEnum(StartupStage).nullable(),
  version: z.number().int(),
  publishedAt: z.iso.datetime().nullable(),
});

const AiPromptVariableDefinitionSchema = z.object({
  description: z.string(),
  source: z.string(),
  example: z.string().optional(),
});

const AiPromptDefinitionSchema = z.object({
  id: z.string().uuid(),
  key: PromptKeySchema,
  displayName: z.string(),
  description: z.string().nullable(),
  surface: PromptSurfaceSchema,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  publishedGlobal: AiPromptRevisionMetaSchema.nullable(),
  publishedStages: z.array(AiPromptRevisionMetaSchema),
  allowedVariables: z.array(z.string()),
  requiredVariables: z.array(z.string()),
  variableDefinitions: z.record(z.string(), AiPromptVariableDefinitionSchema),
});

const AiPromptRevisionSchema = z.object({
  id: z.string().uuid(),
  definitionId: z.string().uuid(),
  stage: z.nativeEnum(StartupStage).nullable(),
  status: PromptStatusSchema,
  systemPrompt: z.string(),
  userPrompt: z.string(),
  notes: z.string().nullable(),
  version: z.number().int(),
  createdBy: z.string().uuid().nullable(),
  publishedBy: z.string().uuid().nullable(),
  publishedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const AiPromptDefinitionsResponseSchema = z.array(AiPromptDefinitionSchema);

export const AiPromptRevisionsResponseSchema = z.object({
  definition: AiPromptDefinitionSchema,
  revisions: z.array(AiPromptRevisionSchema),
  allowedVariables: z.array(z.string()),
  requiredVariables: z.array(z.string()),
  variableDefinitions: z.record(z.string(), AiPromptVariableDefinitionSchema),
});

export const AiPromptSeedResultSchema = z.object({
  insertedTotal: z.number().int(),
  insertedGlobal: z.number().int(),
  insertedByStage: z.record(z.string(), z.number().int()),
  skippedExisting: z.number().int(),
  totalPromptKeys: z.number().int(),
  totalTargetSlots: z.number().int(),
});

const AiFlowNodeSchema = z.object({
  id: z.string(),
  label: z.string(),
  description: z.string(),
  kind: FlowNodeKindSchema,
  promptKeys: z.array(PromptKeySchema),
  inputs: z.array(z.string()),
  outputs: z.array(z.string()),
});

const AiFlowStageSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  nodeIds: z.array(z.string()),
});

const AiFlowEdgeSchema = z.object({
  from: z.string(),
  to: z.string(),
  label: z.string().optional(),
});

const AiFlowSchema = z.object({
  id: z.enum(["pipeline", "clara"]),
  name: z.string(),
  description: z.string(),
  stages: z.array(AiFlowStageSchema),
  nodes: z.array(AiFlowNodeSchema),
  edges: z.array(AiFlowEdgeSchema),
});

export const AiPromptFlowResponseSchema = z.object({
  flows: z.array(AiFlowSchema),
});

export type CreateAiPromptRevision = z.infer<typeof CreateAiPromptRevisionSchema>;
export type UpdateAiPromptRevision = z.infer<typeof UpdateAiPromptRevisionSchema>;

export class CreateAiPromptRevisionDto extends createZodDto(CreateAiPromptRevisionSchema) {}
export class UpdateAiPromptRevisionDto extends createZodDto(UpdateAiPromptRevisionSchema) {}
export class AiPromptDefinitionsResponseDto extends createZodDto(AiPromptDefinitionsResponseSchema) {}
export class AiPromptRevisionsResponseDto extends createZodDto(AiPromptRevisionsResponseSchema) {}
export class AiPromptRevisionResponseDto extends createZodDto(AiPromptRevisionSchema) {}
export class AiPromptSeedResultDto extends createZodDto(AiPromptSeedResultSchema) {}
export class AiPromptFlowResponseDto extends createZodDto(AiPromptFlowResponseSchema) {}
