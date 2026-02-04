import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';
import { ASSET_TYPES, MIME_TYPES } from '../storage.config';

export const GetUploadUrlSchema = z.object({
  assetType: z.enum([
    ASSET_TYPES.AUDIO,
    ASSET_TYPES.IMAGE,
    ASSET_TYPES.VIDEO,
    ASSET_TYPES.TRANSCRIPT,
  ]),
  contentType: z.enum(Object.keys(MIME_TYPES) as [string, ...string[]]),
  projectId: z.string().uuid().optional(),
});

export class GetUploadUrlDto extends createZodDto(GetUploadUrlSchema) {}

export const UploadUrlResponseSchema = z.object({
  uploadUrl: z.url(),
  key: z.string(),
  publicUrl: z.url(),
});

export class UploadUrlResponseDto extends createZodDto(
  UploadUrlResponseSchema,
) {}

export const DownloadUrlResponseSchema = z.object({
  url: z.url(),
});

export class DownloadUrlResponseDto extends createZodDto(
  DownloadUrlResponseSchema,
) {}
