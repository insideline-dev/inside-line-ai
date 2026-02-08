import { z } from "zod";
import { BaseEvaluationSchema } from "../base-evaluation.schema";

export const TractionEvaluationSchema = BaseEvaluationSchema.extend({
  metrics: z.object({
    users: z.number().nonnegative().optional(),
    revenue: z.number().nonnegative().optional(),
    growthRatePct: z.number().optional(),
  }),
  customerValidation: z.string().min(1),
  growthTrajectory: z.string().min(1),
  revenueModel: z.string().min(1),
});

export type TractionEvaluation = z.infer<typeof TractionEvaluationSchema>;
