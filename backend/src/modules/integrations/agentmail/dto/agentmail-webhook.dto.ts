import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const AgentMailWebhookSchema = z.object({
  organization_id: z.string(),
  inbox_id: z.string(),
  thread_id: z.string(),
  message_id: z.string(),
});

export type AgentMailWebhook = z.infer<typeof AgentMailWebhookSchema>;
export class AgentMailWebhookDto extends createZodDto(AgentMailWebhookSchema) {}
