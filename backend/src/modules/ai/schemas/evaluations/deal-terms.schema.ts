import { z } from "zod";
import { BaseEvaluationSchema } from "../base-evaluation.schema";

export const DealTermsEvaluationSchema = BaseEvaluationSchema.extend({
  valuation: z.number().nonnegative().optional(),
  askAmount: z.number().nonnegative().optional(),
  equity: z.number().min(0).max(100).optional(),
  termsQuality: z.string().min(1),
});

export type DealTermsEvaluation = z.infer<typeof DealTermsEvaluationSchema>;
