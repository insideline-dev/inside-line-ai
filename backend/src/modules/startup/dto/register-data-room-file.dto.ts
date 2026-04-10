import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { DocumentCategory } from '../../ai/interfaces/document-classification.interface';

export const RegisterDataRoomFileSchema = z.object({
  path: z.string().min(1),
  name: z.string().min(1),
  type: z.string().min(1),
  size: z.number().int().nonnegative(),
  category: z.nativeEnum(DocumentCategory).optional(),
});

export type RegisterDataRoomFile = z.infer<typeof RegisterDataRoomFileSchema>;

export class RegisterDataRoomFileDto extends createZodDto(
  RegisterDataRoomFileSchema,
) {}

export const RegisterDataRoomFilesBulkSchema = z.object({
  files: z.array(RegisterDataRoomFileSchema).min(1),
});

export type RegisterDataRoomFilesBulk = z.infer<
  typeof RegisterDataRoomFilesBulkSchema
>;

export class RegisterDataRoomFilesBulkDto extends createZodDto(
  RegisterDataRoomFilesBulkSchema,
) {}
