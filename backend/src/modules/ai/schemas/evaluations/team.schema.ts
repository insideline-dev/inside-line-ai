import { z } from "zod";
import { BaseEvaluationSchema } from "../base-evaluation.schema";

export const TeamMemberEvaluationSchema = z.object({
  name: z.string().min(1),
  role: z.string().min(1),
  background: z.string().min(1),
  strengths: z.array(z.string()).default([]),
  concerns: z.array(z.string()).default([]),
});

export const TeamEvaluationSchema = BaseEvaluationSchema.extend({
  founderQuality: z.string().min(1),
  teamCompletion: z.number().int().min(0).max(100),
  executionCapability: z.string().min(1),
  founderMarketFitScore: z.number().int().min(0).max(100),
  teamMembers: z.array(TeamMemberEvaluationSchema).default([]),
});

export type TeamEvaluation = z.infer<typeof TeamEvaluationSchema>;
