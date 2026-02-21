import { createZodDto } from "nestjs-zod";
import { z } from "zod";

const FlowConfigStatusSchema = z.enum(["draft", "published", "archived"]);

export const CreatePipelineFlowConfigSchema = z.object({
  name: z.string().min(1).max(255),
  flowDefinition: z.record(z.string(), z.unknown()),
  pipelineConfig: z.record(z.string(), z.unknown()),
  notes: z.string().max(4000).optional(),
});

export const UpdatePipelineFlowConfigSchema = z
  .object({
    name: z.string().min(1).max(255).optional(),
    flowDefinition: z.record(z.string(), z.unknown()).optional(),
    pipelineConfig: z.record(z.string(), z.unknown()).optional(),
    notes: z.string().max(4000).optional(),
  })
  .refine(
    (v) =>
      v.name !== undefined ||
      v.flowDefinition !== undefined ||
      v.pipelineConfig !== undefined ||
      v.notes !== undefined,
    { message: "At least one field must be provided" },
  );

const PipelineFlowConfigSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  status: FlowConfigStatusSchema,
  version: z.number().int(),
  flowDefinition: z.record(z.string(), z.unknown()),
  pipelineConfig: z.record(z.string(), z.unknown()),
  notes: z.string().nullable(),
  createdBy: z.string().uuid().nullable(),
  publishedBy: z.string().uuid().nullable(),
  publishedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const PipelineFlowConfigListResponseSchema = z.object({
  data: z.array(PipelineFlowConfigSchema),
  total: z.number().int(),
});

export class CreatePipelineFlowConfigDto extends createZodDto(CreatePipelineFlowConfigSchema) {}
export class UpdatePipelineFlowConfigDto extends createZodDto(UpdatePipelineFlowConfigSchema) {}
export class PipelineFlowConfigResponseDto extends createZodDto(PipelineFlowConfigSchema) {}
export class PipelineFlowConfigListResponseDto extends createZodDto(PipelineFlowConfigListResponseSchema) {}
