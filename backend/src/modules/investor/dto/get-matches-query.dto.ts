import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const GetMatchesQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  minScore: z.coerce.number().int().min(0).max(100).optional(),
  isSaved: z.coerce.boolean().optional(),
});

export type GetMatchesQuery = z.infer<typeof GetMatchesQuerySchema>;
export class GetMatchesQueryDto extends createZodDto(GetMatchesQuerySchema) {}
