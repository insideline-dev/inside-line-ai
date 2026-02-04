import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';

export const sendMessageSchema = z.object({
  to: z.string().regex(/^\+\d{10,15}$/, 'Phone number must be in E.164 format (+1234567890)'),
  body: z.string().min(1).max(1600, 'Message body cannot exceed 1600 characters'),
  mediaUrl: z.string().url().optional(),
});

export class SendMessageDto extends createZodDto(sendMessageSchema) {}
