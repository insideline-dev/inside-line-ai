import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';

export const getMessagesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  conversationId: z.string().optional(),
});

export class GetMessagesQueryDto extends createZodDto(getMessagesQuerySchema) {}
