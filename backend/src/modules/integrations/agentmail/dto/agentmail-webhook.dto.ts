import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const AttachmentSchema = z.object({
  filename: z.string(),
  url: z.string().url(),
  size: z.number(),
  content_type: z.string(),
});

const MessageSchema = z.object({
  id: z.string(),
  from: z.string().email(),
  to: z.array(z.string().email()),
  subject: z.string(),
  text: z.string(),
  html: z.string(),
  attachments: z.array(AttachmentSchema).default([]),
  timestamp: z.string().datetime(),
});

export const AgentMailWebhookSchema = z.object({
  event: z.string(),
  thread_id: z.string(),
  message: MessageSchema,
  signature: z.string(),
});

export type AgentMailWebhook = z.infer<typeof AgentMailWebhookSchema>;
export class AgentMailWebhookDto extends createZodDto(AgentMailWebhookSchema) {}
