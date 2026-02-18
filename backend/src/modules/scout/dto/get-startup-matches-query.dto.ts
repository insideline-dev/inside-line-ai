import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const GetStartupMatchesQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(20).default(3),
});

export type GetStartupMatchesQuery = z.infer<typeof GetStartupMatchesQuerySchema>;
export class GetStartupMatchesQueryDto extends createZodDto(
  GetStartupMatchesQuerySchema,
) {}
