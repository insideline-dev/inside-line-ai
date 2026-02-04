import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';

export const twilioWebhookSchema = z.object({
  MessageSid: z.string(),
  AccountSid: z.string(),
  MessagingServiceSid: z.string().optional(),
  From: z.string(),
  To: z.string(),
  Body: z.string().optional().default(''),
  NumMedia: z.string().optional(),
  MediaUrl0: z.string().url().optional(),
  MediaContentType0: z.string().optional(),
  Timestamp: z.string().optional(),
});

export class TwilioWebhookDto extends createZodDto(twilioWebhookSchema) {}
