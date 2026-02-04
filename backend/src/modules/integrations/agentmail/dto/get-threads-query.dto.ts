import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const GetThreadsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  unread: z
    .enum(['true', 'false'])
    .optional()
    .transform((val) => (val === 'true' ? true : val === 'false' ? false : undefined)),
});

export type GetThreadsQuery = z.infer<typeof GetThreadsQuerySchema>;
export class GetThreadsQueryDto extends createZodDto(GetThreadsQuerySchema) {}
