import { createZodDto } from "nestjs-zod";
import { z } from "zod";
import { AI_PROMPT_KEYS } from "../../ai/services/ai-prompt-catalog";
import { AI_RUNTIME_ALLOWED_MODEL_NAMES } from "../../ai/services/ai-runtime-config.schema";
import { StartupStage } from "../../startup/entities/startup.schema";

const PromptKeySchema = z.enum(AI_PROMPT_KEYS);
const PromptSurfaceSchema = z.enum(["pipeline", "clara"]);
const PromptStatusSchema = z.enum(["draft", "published", "archived"]);
const ModelConfigStatusSchema = z.enum(["draft", "published", "archived"]);
const FlowNodeKindSchema = z.enum(["prompt", "system"]);
const PromptSearchModeSchema = z.enum(["off", "provider_grounded_search"]);
const ModelConfigSourceSchema = z.enum(["default", "published", "revision_override"]);
const FlowPortTypeSchema = z.enum(["text", "object", "array", "number"]);
const ContextFieldTypeSchema = z.enum([
  "string",
  "number",
  "boolean",
  "array",
  "object",
  "unknown",
]);

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
  seededSchemaRevisions: z.number().int(),
  skippedSchemaRevisions: z.number().int(),
  totalPromptKeys: z.number().int(),
  totalTargetSlots: z.number().int(),
});

export const CreateAiModelConfigDraftSchema = z.object({
  modelName: z.enum(AI_RUNTIME_ALLOWED_MODEL_NAMES),
  searchMode: PromptSearchModeSchema,
  stage: z.nativeEnum(StartupStage).nullable().optional(),
  notes: z.string().trim().max(4000).optional(),
});

export const UpdateAiModelConfigDraftSchema = z
  .object({
    modelName: z.enum(AI_RUNTIME_ALLOWED_MODEL_NAMES).optional(),
    searchMode: PromptSearchModeSchema.optional(),
    notes: z.string().trim().max(4000).optional(),
  })
  .refine(
    (value) =>
      value.modelName !== undefined ||
      value.searchMode !== undefined ||
      value.notes !== undefined,
    { message: "At least one field must be provided" },
  );

const ResolvedModelConfigSchema = z.object({
  source: ModelConfigSourceSchema,
  revisionId: z.string().uuid().nullable(),
  stage: z.nativeEnum(StartupStage).nullable(),
  purpose: z.string(),
  modelName: z.string(),
  provider: z.string(),
  searchMode: PromptSearchModeSchema,
  supportedSearchModes: z.array(PromptSearchModeSchema),
});

const AiModelConfigRevisionSchema = z.object({
  id: z.string().uuid(),
  stage: z.nativeEnum(StartupStage).nullable(),
  status: ModelConfigStatusSchema,
  modelName: z.string(),
  searchMode: PromptSearchModeSchema,
  notes: z.string().nullable(),
  version: z.number().int(),
  createdBy: z.string().uuid().nullable(),
  publishedBy: z.string().uuid().nullable(),
  publishedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const AiModelConfigResponseSchema = z.object({
  resolved: ResolvedModelConfigSchema,
  revisions: z.array(AiModelConfigRevisionSchema),
  allowedModels: z.array(z.string()),
});

export const AiPromptOutputSchemaResponseSchema = z.object({
  key: PromptKeySchema,
  jsonSchema: z.unknown(),
  note: z.string(),
});

const AiFlowPortSchema = z.object({
  label: z.string(),
  type: FlowPortTypeSchema,
  fromNodeId: z.string().optional(),
  toNodeIds: z.array(z.string()).optional(),
});

const AiFlowNodeSchema = z.object({
  id: z.string(),
  label: z.string(),
  description: z.string(),
  kind: FlowNodeKindSchema,
  promptKeys: z.array(PromptKeySchema),
  inputs: z.array(AiFlowPortSchema),
  outputs: z.array(AiFlowPortSchema),
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

const AiPromptContextFieldSchema = z.object({
  path: z.string(),
  label: z.string(),
  type: ContextFieldTypeSchema,
  sourceVariable: z.string().nullable().optional(),
  description: z.string().optional(),
});

export const AiPromptContextSchemaResponseSchema = z.object({
  key: PromptKeySchema,
  displayName: z.string(),
  description: z.string().nullable(),
  allowedVariables: z.array(z.string()),
  requiredVariables: z.array(z.string()),
  variableDefinitions: z.record(z.string(), AiPromptVariableDefinitionSchema),
  requiredPhases: z.array(z.string()),
  contextFields: z.array(AiPromptContextFieldSchema),
  notes: z.array(z.string()),
});

export const PreviewAiPromptRequestSchema = z.object({
  startupId: z.string().uuid().optional(),
  stage: z.nativeEnum(StartupStage).nullable().optional(),
  investorThesis: z.string().trim().min(1).optional(),
  fromEmail: z.string().email().optional(),
  subject: z.string().optional(),
  body: z.string().optional(),
  attachments: z.array(z.string()).optional(),
  hasLinkedStartup: z.boolean().optional(),
  historyBlock: z.string().optional(),
  investorName: z.string().optional(),
  intent: z.string().optional(),
  startupBlock: z.string().optional(),
  intentInstructions: z.string().optional(),
});

export const PreviewAiPipelineContextRequestSchema = z.object({
  startupId: z.string().uuid(),
  stage: z.nativeEnum(StartupStage).nullable().optional(),
});

const AiPromptPreviewSourceSchema = z.object({
  promptSource: z.enum(["db", "code"]),
  promptRevisionId: z.string().uuid().nullable(),
  effectiveStage: z.nativeEnum(StartupStage).nullable(),
  startupId: z.string().uuid().nullable(),
});

const AiPromptPreviewPromptSchema = z.object({
  systemPromptTemplate: z.string(),
  userPromptTemplate: z.string(),
  renderedSystemPrompt: z.string(),
  renderedUserPrompt: z.string(),
});

const AiPromptPreviewModelSchema = z.object({
  purpose: z.string(),
  modelName: z.string(),
  provider: z.string(),
  searchMode: PromptSearchModeSchema,
  supportedSearchModes: z.array(PromptSearchModeSchema),
});

const AiPromptPreviewHashesSchema = z.object({
  renderedSystemPrompt: z.string(),
  renderedUserPrompt: z.string(),
  variables: z.string(),
});

const AiContextSectionSchema = z.object({
  title: z.string(),
  data: z.unknown(),
});

export const AiPromptPreviewResponseSchema = z.object({
  key: PromptKeySchema,
  source: AiPromptPreviewSourceSchema,
  prompt: AiPromptPreviewPromptSchema,
  model: AiPromptPreviewModelSchema,
  resolvedVariables: z.record(z.string(), z.any()),
  parsedContextJson: z.unknown().nullable().optional(),
  parsedContextSections: z.array(AiContextSectionSchema).nullable().optional(),
  sectionTitles: z.array(z.string()).optional(),
  hashes: AiPromptPreviewHashesSchema,
});

const AiPipelineContextAgentPreviewSchema = z.object({
  phase: z.string(),
  agentKey: z.string(),
  promptKey: PromptKeySchema,
  promptSource: z.enum(["db", "code"]),
  promptRevisionId: z.string().uuid().nullable(),
  effectiveStage: z.nativeEnum(StartupStage).nullable(),
  resolvedVariables: z.record(z.string(), z.any()),
  renderedSystemPrompt: z.string(),
  renderedUserPrompt: z.string(),
  parsedContextJson: z.unknown().nullable(),
  parsedContextSections: z.array(AiContextSectionSchema).nullable(),
  hashes: AiPromptPreviewHashesSchema,
});

export const AiPipelineContextPreviewResponseSchema = z.object({
  startupId: z.string().uuid(),
  effectiveStage: z.nativeEnum(StartupStage).nullable(),
  generatedAt: z.iso.datetime(),
  agents: z.array(AiPipelineContextAgentPreviewSchema),
});

export type CreateAiPromptRevision = z.infer<typeof CreateAiPromptRevisionSchema>;
export type UpdateAiPromptRevision = z.infer<typeof UpdateAiPromptRevisionSchema>;
export type CreateAiModelConfigDraft = z.infer<typeof CreateAiModelConfigDraftSchema>;
export type UpdateAiModelConfigDraft = z.infer<typeof UpdateAiModelConfigDraftSchema>;

export class CreateAiPromptRevisionDto extends createZodDto(CreateAiPromptRevisionSchema) {}
export class UpdateAiPromptRevisionDto extends createZodDto(UpdateAiPromptRevisionSchema) {}
export class CreateAiModelConfigDraftDto extends createZodDto(CreateAiModelConfigDraftSchema) {}
export class UpdateAiModelConfigDraftDto extends createZodDto(UpdateAiModelConfigDraftSchema) {}
export class AiPromptDefinitionsResponseDto extends createZodDto(AiPromptDefinitionsResponseSchema) {}
export class AiPromptRevisionsResponseDto extends createZodDto(AiPromptRevisionsResponseSchema) {}
export class AiPromptRevisionResponseDto extends createZodDto(AiPromptRevisionSchema) {}
export class AiPromptSeedResultDto extends createZodDto(AiPromptSeedResultSchema) {}
export class AiModelConfigResponseDto extends createZodDto(AiModelConfigResponseSchema) {}
export class AiPromptFlowResponseDto extends createZodDto(AiPromptFlowResponseSchema) {}
export class AiPromptContextSchemaResponseDto extends createZodDto(AiPromptContextSchemaResponseSchema) {}
export class PreviewAiPromptRequestDto extends createZodDto(PreviewAiPromptRequestSchema) {}
export class AiPromptPreviewResponseDto extends createZodDto(AiPromptPreviewResponseSchema) {}
export class AiPromptOutputSchemaResponseDto extends createZodDto(
  AiPromptOutputSchemaResponseSchema,
) {}
export class PreviewAiPipelineContextRequestDto extends createZodDto(
  PreviewAiPipelineContextRequestSchema,
) {}
export class AiPipelineContextPreviewResponseDto extends createZodDto(
  AiPipelineContextPreviewResponseSchema,
) {}
