import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const ProgressPhaseSchema = z.object({
  status: z.string(),
  progress: z.number().min(0).max(100),
  error: z.string().optional(),
});

export const ProgressSchema = z.object({
  overallProgress: z.number().min(0).max(100),
  currentPhase: z.string(),
  phasesCompleted: z.array(z.string()),
  pipelineStatus: z.string().optional(),
  error: z.string().optional(),
  phases: z.record(z.string(), ProgressPhaseSchema),
});

export const GetProgressResponseSchema = z.object({
  status: z.enum(['draft', 'submitted', 'analyzing', 'pending_review', 'approved', 'rejected']),
  progress: ProgressSchema.nullable(),
});

export type GetProgressResponse = z.infer<typeof GetProgressResponseSchema>;

export class ProgressPhaseDto extends createZodDto(ProgressPhaseSchema) {}

export class ProgressDto extends createZodDto(ProgressSchema) {}

export class GetProgressResponseDto extends createZodDto(
  GetProgressResponseSchema,
) {}
