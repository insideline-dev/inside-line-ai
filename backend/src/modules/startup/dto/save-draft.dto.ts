import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const SaveDraftSchema = z.object({
  draftData: z.record(z.string(), z.unknown()),
});

export type SaveDraft = z.infer<typeof SaveDraftSchema>;
export class SaveDraftDto extends createZodDto(SaveDraftSchema) {}
