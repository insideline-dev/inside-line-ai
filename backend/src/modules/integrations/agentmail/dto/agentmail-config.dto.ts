import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const AgentMailConfigSchema = z.object({
  inboxId: z.string().min(1),
  apiKey: z.string().min(1),
  webhookUrl: z.string().url(),
});

export type AgentMailConfig = z.infer<typeof AgentMailConfigSchema>;
export class AgentMailConfigDto extends createZodDto(AgentMailConfigSchema) {}
