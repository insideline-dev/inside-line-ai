import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { AnalysisJobType, AnalysisJobStatus } from '../entities';

const GetJobsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  jobType: z.nativeEnum(AnalysisJobType).optional(),
  status: z.nativeEnum(AnalysisJobStatus).optional(),
});

export class GetJobsQueryDto extends createZodDto(GetJobsQuerySchema) {}
