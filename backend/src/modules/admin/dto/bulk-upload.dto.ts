import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const BulkUploadRowStatusSchema = z.enum([
  'created',
  'duplicate_merged',
  'failed',
]);

export const BulkUploadRowResultSchema = z.object({
  rowIndex: z.number().int().nonnegative(),
  company: z.string(),
  status: BulkUploadRowStatusSchema,
  startupId: z.string().uuid().optional(),
  reason: z.string().optional(),
});

export const BulkUploadResponseSchema = z.object({
  total: z.number().int().nonnegative(),
  created: z.number().int().nonnegative(),
  duplicate_merged: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  rows: z.array(BulkUploadRowResultSchema),
});

export type BulkUploadResponse = z.infer<typeof BulkUploadResponseSchema>;

export class BulkUploadResponseDto extends createZodDto(BulkUploadResponseSchema) {}
