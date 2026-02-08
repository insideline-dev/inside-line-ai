import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const AgentMailConfigSchema = z.object({
  inboxId: z.string().min(1),
  inboxEmail: z.string().optional(),
  displayName: z.string().optional(),
  isActive: z.boolean().default(true),
});

export type AgentMailConfig = z.infer<typeof AgentMailConfigSchema>;
export class AgentMailConfigDto extends createZodDto(AgentMailConfigSchema) {}
