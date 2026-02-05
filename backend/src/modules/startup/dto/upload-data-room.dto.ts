import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const UploadDataRoomSchema = z.object({
  category: z.string().min(1).max(100),
  assetId: z.string().uuid().optional(),
});

export type UploadDataRoom = z.infer<typeof UploadDataRoomSchema>;

export class UploadDataRoomDto extends createZodDto(UploadDataRoomSchema) {}
