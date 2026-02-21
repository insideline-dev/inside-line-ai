import { createZodDto } from "nestjs-zod";
import { z } from "zod";

const AgentConfigSchema = z.object({
  id: z.string().uuid(),
  flowId: z.string(),
  orchestratorNodeId: z.string(),
  agentKey: z.string(),
  label: z.string(),
  description: z.string().nullable(),
  kind: z.enum(["prompt", "system"]),
  enabled: z.boolean(),
  promptDefinitionId: z.string().uuid().nullable(),
  executionPhase: z.number().int(),
  dependsOn: z.array(z.string()),
  sortOrder: z.number().int(),
  isCustom: z.boolean(),
  createdBy: z.string().uuid().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const CreateAiAgentConfigSchema = z.object({
  agentKey: z.string().min(2).max(120),
  label: z.string().min(1).max(255),
  description: z.string().trim().max(4000).optional(),
  executionPhase: z.number().int().min(1).max(3).optional(),
  dependsOn: z.array(z.string()).optional(),
  sortOrder: z.number().int().optional(),
});

export const UpdateAiAgentConfigSchema = z
  .object({
    label: z.string().min(1).max(255).optional(),
    description: z.string().trim().max(4000).optional(),
    executionPhase: z.number().int().min(1).max(3).optional(),
    dependsOn: z.array(z.string()).optional(),
    sortOrder: z.number().int().optional(),
    enabled: z.boolean().optional(),
  })
  .refine((input) => Object.keys(input).length > 0, {
    message: "At least one field must be provided",
  });

export const AiAgentConfigListResponseSchema = z.object({
  items: z.array(AgentConfigSchema),
});

const UpstreamNodeFieldsSchema = z.object({
  nodeId: z.string(),
  label: z.string(),
  fields: z.array(z.string()),
});

export const UpstreamNodeFieldsResponseSchema = z.object({
  items: z.array(UpstreamNodeFieldsSchema),
});

export class CreateAiAgentConfigDto extends createZodDto(CreateAiAgentConfigSchema) {}
export class UpdateAiAgentConfigDto extends createZodDto(UpdateAiAgentConfigSchema) {}
export class AiAgentConfigResponseDto extends createZodDto(AgentConfigSchema) {}
export class AiAgentConfigListResponseDto extends createZodDto(AiAgentConfigListResponseSchema) {}
export class UpstreamNodeFieldsResponseDto extends createZodDto(UpstreamNodeFieldsResponseSchema) {}
