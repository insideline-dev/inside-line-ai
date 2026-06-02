import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const ExtractDeckMetadataSchema = z.object({
  storageKey: z.string().min(1).max(512),
});

export type ExtractDeckMetadata = z.infer<typeof ExtractDeckMetadataSchema>;
export class ExtractDeckMetadataDto extends createZodDto(
  ExtractDeckMetadataSchema,
) {}

export const ExtractDeckMetadataResponseSchema = z.object({
  companyName: z.string().nullable(),
  website: z.string().nullable(),
  industry: z.string().nullable().optional(),
  stage: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  extracted: z.boolean(),
});

export type ExtractDeckMetadataResponse = z.infer<
  typeof ExtractDeckMetadataResponseSchema
>;
export class ExtractDeckMetadataResponseDto extends createZodDto(
  ExtractDeckMetadataResponseSchema,
) {}
