import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const GetSubmissionsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(10),
  investorId: z.string().uuid().optional(),
});

export type GetSubmissionsQuery = z.infer<typeof GetSubmissionsQuerySchema>;
export class GetSubmissionsQueryDto extends createZodDto(GetSubmissionsQuerySchema) {}
