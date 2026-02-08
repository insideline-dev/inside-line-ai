import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const CreateInboxSchema = z.object({
  username: z.string().min(1).optional(),
  displayName: z.string().min(1).optional(),
});

export type CreateInbox = z.infer<typeof CreateInboxSchema>;
export class CreateInboxDto extends createZodDto(CreateInboxSchema) {}
