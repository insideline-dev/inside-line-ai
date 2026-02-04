import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { PortalSubmissionStatus } from '../entities/portal.schema';

export const GetSubmissionsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(10),
  status: z.nativeEnum(PortalSubmissionStatus).optional(),
});

export type GetSubmissionsQuery = z.infer<typeof GetSubmissionsQuerySchema>;
export class GetSubmissionsQueryDto extends createZodDto(
  GetSubmissionsQuerySchema,
) {}
