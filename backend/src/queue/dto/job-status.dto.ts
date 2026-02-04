import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';

export const JobStatusSchema = z.object({
  id: z.string(),
  state: z.enum(['waiting', 'active', 'completed', 'failed', 'delayed']),
  progress: z.number().optional(),
  data: z.record(z.string(), z.unknown()),
  result: z.record(z.string(), z.unknown()).nullable(),
  failedReason: z.string().nullable(),
  attemptsMade: z.number(),
  timestamp: z.number(),
  finishedOn: z.number().nullable(),
});

export class JobStatusDto extends createZodDto(JobStatusSchema) {}

export const JobIdResponseSchema = z.object({
  jobId: z.string(),
  queue: z.string(),
  message: z.string().optional(),
});

export class JobIdResponseDto extends createZodDto(JobIdResponseSchema) {}
