import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const GetNotificationsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  read: z
    .enum(['true', 'false'])
    .optional()
    .transform((val) => (val === 'true' ? true : val === 'false' ? false : undefined)),
});

export type GetNotificationsQuery = z.infer<typeof GetNotificationsQuerySchema>;
export class GetNotificationsQueryDto extends createZodDto(GetNotificationsQuerySchema) {}
