import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const DataGateOpenQuestionSchema = z.object({
  id: z.string(),
  summary: z.string(),
  status: z.string(),
});

export const DataGateInfoSchema = z.object({
  dataGateStatus: z.string().nullable(),
  docRequestedAt: z.string().nullable(),
  openQuestions: z.array(DataGateOpenQuestionSchema),
  missingMaterials: z.array(z.string()),
  requiredDocTypes: z.array(z.string()),
  presentDocTypes: z.array(z.string()),
  founderEmail: z.string().nullable(),
});

export type DataGateInfo = z.infer<typeof DataGateInfoSchema>;

export class DataGateInfoDto extends createZodDto(DataGateInfoSchema) {}

export const DataGateStatusResponseSchema = z.object({
  ok: z.boolean(),
  startupId: z.string(),
  dataGateStatus: z.string(),
});

export class DataGateStatusResponseDto extends createZodDto(
  DataGateStatusResponseSchema,
) {}

export const RequestDocumentsSchema = z.object({
  founderEmail: z.string().email().optional(),
});

export type RequestDocuments = z.infer<typeof RequestDocumentsSchema>;

export class RequestDocumentsDto extends createZodDto(RequestDocumentsSchema) {}

export const RequestDocumentsResponseSchema = z.object({
  success: z.boolean(),
  sentTo: z.string().nullable().optional(),
  requestedDocs: z.array(z.string()).optional(),
  note: z.string().optional(),
});

export class RequestDocumentsResponseDto extends createZodDto(
  RequestDocumentsResponseSchema,
) {}
