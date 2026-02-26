import { createZodDto } from "nestjs-zod";
import { z } from "zod";

const FlowConfigStatusSchema = z.enum(["draft", "published", "archived"]);
const FlowEdgeFieldMappingSchema = z.object({
  fromPath: z.string().min(1),
  toKey: z.string().min(1),
  required: z.boolean().optional(),
});
const FlowEdgeMappingSchema = z
  .object({
    mode: z.enum(["full_output", "field_map"]).optional(),
    fieldMap: z.array(FlowEdgeFieldMappingSchema).optional(),
    mergeStrategy: z.enum(["object", "array"]).optional(),
  })
  .optional();
const FlowEdgeSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  label: z.string().optional(),
  sourceHandle: z.string().min(1).optional(),
  targetHandle: z.string().min(1).optional(),
  enabled: z.boolean().optional(),
  mapping: FlowEdgeMappingSchema,
});

const FlowScrapeWebsiteNodeConfigSchema = z.object({
  scraping: z
    .object({
      manualPaths: z.array(z.string().min(1)).max(100).optional(),
      discoveryEnabled: z.boolean().optional(),
    })
    .optional(),
});

const FlowNodeConfigsSchema = z
  .object({
    scrape_website: FlowScrapeWebsiteNodeConfigSchema.optional(),
  })
  .catchall(z.unknown())
  .optional();

const FlowDefinitionSchema = z
  .object({
    flowId: z.enum(["pipeline", "clara"]),
    nodes: z.array(z.string().min(1)).min(1),
    edges: z.array(FlowEdgeSchema),
    nodeConfigs: FlowNodeConfigsSchema,
  })
  .superRefine((value, ctx) => {
    const nodeSet = new Set(value.nodes);
    const duplicateNodeIds = new Set<string>();

    for (const nodeId of value.nodes) {
      if (duplicateNodeIds.has(nodeId)) {
        continue;
      }
      const duplicateCount = value.nodes.filter((node) => node === nodeId).length;
      if (duplicateCount > 1) {
        duplicateNodeIds.add(nodeId);
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["nodes"],
          message: `Duplicate node id "${nodeId}" is not allowed`,
        });
      }
    }

    const edgePairs = new Set<string>();
    value.edges.forEach((edge, index) => {
      if (!nodeSet.has(edge.from)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["edges", index, "from"],
          message: `Unknown source node "${edge.from}"`,
        });
      }
      if (!nodeSet.has(edge.to)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["edges", index, "to"],
          message: `Unknown target node "${edge.to}"`,
        });
      }
      if (edge.from === edge.to) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["edges", index],
          message: `Self-referential edge "${edge.from} -> ${edge.to}" is not allowed`,
        });
      }

      const mappingMode = edge.mapping?.mode ?? "full_output";
      if (
        mappingMode === "field_map" &&
        (!edge.mapping?.fieldMap || edge.mapping.fieldMap.length === 0)
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["edges", index, "mapping", "fieldMap"],
          message: "field_map mapping requires at least one fieldMap entry",
        });
      }

      const pairKey = `${edge.from}:${edge.sourceHandle ?? ""}->${edge.to}:${edge.targetHandle ?? ""}`;
      if (edgePairs.has(pairKey)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["edges", index],
          message: `Duplicate edge "${pairKey}" is not allowed`,
        });
      }
      edgePairs.add(pairKey);
    });
  });

export const CreatePipelineFlowConfigSchema = z.object({
  name: z.string().min(1).max(255),
  flowDefinition: FlowDefinitionSchema,
  pipelineConfig: z.record(z.string(), z.unknown()),
  notes: z.string().max(4000).optional(),
});

export const UpdatePipelineFlowConfigSchema = z
  .object({
    name: z.string().min(1).max(255).optional(),
    flowDefinition: FlowDefinitionSchema.optional(),
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
  flowDefinition: FlowDefinitionSchema,
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
