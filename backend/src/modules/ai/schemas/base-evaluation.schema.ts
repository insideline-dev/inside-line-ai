import { z } from "zod";

export const BaseEvaluationSchema = z.object({
  score: z.number().int().min(0).max(100),
  confidence: z.number().min(0).max(1),
  feedback: z.string().min(1),
  keyFindings: z.array(z.string()).default([]),
  risks: z.array(z.string()).default([]),
  dataGaps: z.array(z.string()).default([]),
  sources: z.array(z.string()).default([]),
});

export type BaseEvaluation = z.infer<typeof BaseEvaluationSchema>;
