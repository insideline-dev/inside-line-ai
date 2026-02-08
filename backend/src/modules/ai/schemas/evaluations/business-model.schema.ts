import { z } from "zod";
import { BaseEvaluationSchema } from "../base-evaluation.schema";

export const BusinessModelEvaluationSchema = BaseEvaluationSchema.extend({
  revenueStreams: z.array(z.string()).default([]),
  unitEconomics: z.string().min(1),
  scalability: z.string().min(1),
  defensibility: z.string().min(1),
});

export type BusinessModelEvaluation = z.infer<
  typeof BusinessModelEvaluationSchema
>;
