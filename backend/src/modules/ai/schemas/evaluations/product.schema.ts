import { z } from "zod";
import { BaseEvaluationSchema } from "../base-evaluation.schema";

export const ProductEvaluationSchema = BaseEvaluationSchema.extend({
  productDescription: z.string().min(1),
  uniqueValue: z.string().min(1),
  technologyStack: z.array(z.string()).default([]),
  keyFeatures: z.array(z.string()).default([]),
  productMaturity: z.string().min(1),
});

export type ProductEvaluation = z.infer<typeof ProductEvaluationSchema>;
