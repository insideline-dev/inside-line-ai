import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { ScoutApplicationStatus } from '../entities/scout.schema';

export const GetApplicationsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(10),
  status: z.nativeEnum(ScoutApplicationStatus).optional(),
});

export type GetApplicationsQuery = z.infer<typeof GetApplicationsQuerySchema>;
export class GetApplicationsQueryDto extends createZodDto(GetApplicationsQuerySchema) {}
