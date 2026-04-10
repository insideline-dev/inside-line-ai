import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { DocumentCategory } from '../../ai/interfaces/document-classification.interface';

export const UpdateDataRoomCategorySchema = z.object({
  category: z.nativeEnum(DocumentCategory),
});

export type UpdateDataRoomCategory = z.infer<typeof UpdateDataRoomCategorySchema>;

export class UpdateDataRoomCategoryDto extends createZodDto(
  UpdateDataRoomCategorySchema,
) {}
