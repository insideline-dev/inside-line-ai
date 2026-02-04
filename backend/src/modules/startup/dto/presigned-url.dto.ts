import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const PresignedUrlSchema = z.object({
  fileName: z.string().min(1).max(200),
  fileType: z.string().min(1).max(100),
  fileSize: z.number().int().positive().max(50 * 1024 * 1024), // 50MB max
});

export type PresignedUrl = z.infer<typeof PresignedUrlSchema>;
export class PresignedUrlDto extends createZodDto(PresignedUrlSchema) {}

export const PresignedUrlResponseSchema = z.object({
  uploadUrl: z.string().url(),
  key: z.string(),
  publicUrl: z.string().url(),
});

export type PresignedUrlResponse = z.infer<typeof PresignedUrlResponseSchema>;
export class PresignedUrlResponseDto extends createZodDto(
  PresignedUrlResponseSchema,
) {}
