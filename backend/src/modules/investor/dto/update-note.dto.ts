import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const UpdateNoteSchema = z.object({
  content: z.string().min(1).max(5000).optional(),
  category: z.string().max(100).optional(),
  isPinned: z.boolean().optional(),
});

export type UpdateNote = z.infer<typeof UpdateNoteSchema>;

export class UpdateNoteDto extends createZodDto(UpdateNoteSchema) {}
