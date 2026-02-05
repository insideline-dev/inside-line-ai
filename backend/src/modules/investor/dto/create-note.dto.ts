import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const CreateNoteSchema = z.object({
  startupId: z.string().uuid(),
  content: z.string().min(1).max(5000),
  category: z.string().max(100).optional(),
  isPinned: z.boolean().optional(),
});

export type CreateNote = z.infer<typeof CreateNoteSchema>;

export class CreateNoteDto extends createZodDto(CreateNoteSchema) {}
