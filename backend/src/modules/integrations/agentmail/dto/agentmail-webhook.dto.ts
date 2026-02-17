import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const AgentMailWebhookMessageSchema = z.object({
  inbox_id: z.string().optional(),
  thread_id: z.string().optional(),
  id: z.string().optional(),
  message_id: z.string().optional(),
  smtp_id: z.string().optional(),
  from: z.string().optional(),
  to: z.array(z.string()).optional(),
  subject: z.string().optional(),
  text: z.string().optional(),
  extracted_text: z.string().optional(),
  timestamp: z.string().optional(),
  created_at: z.string().optional(),
  attachments: z.array(z.record(z.string(), z.unknown())).optional(),
}).passthrough();

const AgentMailWebhookThreadSchema = z.object({
  inbox_id: z.string().optional(),
  thread_id: z.string().optional(),
  id: z.string().optional(),
}).passthrough();

export const AgentMailWebhookSchema = z.object({
  organization_id: z.string().optional(),
  event_id: z.string().optional(),
  event_type: z.string().optional(),
  type: z.string().optional(),
  body_included: z.boolean().optional(),
  inbox_id: z.string().optional(),
  thread_id: z.string().optional(),
  message_id: z.string().optional(),
  message: AgentMailWebhookMessageSchema.optional(),
  thread: AgentMailWebhookThreadSchema.optional(),
}).passthrough();

export type AgentMailWebhook = z.infer<typeof AgentMailWebhookSchema>;
export class AgentMailWebhookDto extends createZodDto(AgentMailWebhookSchema) {}
