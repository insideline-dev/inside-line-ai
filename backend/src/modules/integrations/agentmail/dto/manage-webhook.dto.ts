import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const ManageWebhookSchema = z.object({
  url: z.string().url(),
  eventTypes: z.array(z.string()).min(1),
});

export type ManageWebhook = z.infer<typeof ManageWebhookSchema>;
export class ManageWebhookDto extends createZodDto(ManageWebhookSchema) {}
