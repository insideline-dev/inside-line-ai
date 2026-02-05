import { z } from 'zod';

export const ProgressPhaseSchema = z.object({
  status: z.string(),
  progress: z.number().min(0).max(100),
});

export const ProgressSchema = z.object({
  overallProgress: z.number().min(0).max(100),
  currentPhase: z.string(),
  phasesCompleted: z.array(z.string()),
  phases: z.record(z.string(), ProgressPhaseSchema),
});

export const GetProgressResponseSchema = z.object({
  status: z.enum(['draft', 'submitted', 'analyzing', 'pending_review', 'approved', 'rejected']),
  progress: ProgressSchema.nullable(),
});

export type GetProgressResponse = z.infer<typeof GetProgressResponseSchema>;
