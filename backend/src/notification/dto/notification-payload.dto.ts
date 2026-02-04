import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { NotificationType } from '../entities';

export const NotificationPayloadSchema = z.object({
  title: z.string().min(1).max(200),
  message: z.string().min(1).max(1000),
  type: z.nativeEnum(NotificationType).default(NotificationType.INFO),
  link: z.string().url().optional(),
});

export type NotificationPayload = z.infer<typeof NotificationPayloadSchema>;
export class NotificationPayloadDto extends createZodDto(NotificationPayloadSchema) {}
