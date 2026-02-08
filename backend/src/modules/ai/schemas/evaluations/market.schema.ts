import { z } from "zod";
import { BaseEvaluationSchema } from "../base-evaluation.schema";

export const MarketEvaluationSchema = BaseEvaluationSchema.extend({
  marketSize: z.string().min(1),
  marketGrowth: z.string().min(1),
  tamEstimate: z.number().nonnegative(),
  marketTiming: z.string().min(1),
  credibilityScore: z.number().int().min(0).max(100),
});

export type MarketEvaluation = z.infer<typeof MarketEvaluationSchema>;
