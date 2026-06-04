import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const UploadDataRoomSchema = z.object({
  category: z.string().min(1).max(100),
  assetId: z.string().uuid().optional(),
  // When true, store the document with the provided category verbatim and skip
  // AI re-classification (the human's categorization is trusted). Multipart form
  // fields arrive as strings, so accept the boolean-ish string forms too.
  trustCategory: z
    .union([z.boolean(), z.enum(['true', 'false'])])
    .optional()
    .transform((v) => v === true || v === 'true'),
});

export type UploadDataRoom = z.infer<typeof UploadDataRoomSchema>;

export class UploadDataRoomDto extends createZodDto(UploadDataRoomSchema) {}
