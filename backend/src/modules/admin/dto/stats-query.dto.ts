import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const GetStartupStatsQuerySchema = z.object({
  days: z.coerce.number().int().positive().max(365).default(30),
});

export type GetStartupStatsQuery = z.infer<typeof GetStartupStatsQuerySchema>;
export class GetStartupStatsQueryDto extends createZodDto(
  GetStartupStatsQuerySchema,
) {}
