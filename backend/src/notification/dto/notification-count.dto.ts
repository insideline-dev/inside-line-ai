import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const NotificationCountSchema = z.object({
  count: z.number().int().nonnegative(),
});

export type NotificationCount = z.infer<typeof NotificationCountSchema>;
export class NotificationCountDto extends createZodDto(NotificationCountSchema) {}
