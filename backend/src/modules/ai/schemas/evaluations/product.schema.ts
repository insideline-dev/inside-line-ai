import { z } from "zod";
import { BaseEvaluationSchema } from "../base-evaluation.schema";

const requiredStringFromNull = (fallback: string) =>
  z.preprocess(
    (value) => (value === null ? fallback : value),
    z.string().min(1),
  );

export const ProductEvaluationSchema = BaseEvaluationSchema.extend({
  productDescription: requiredStringFromNull("Product description requires manual review"),
  uniqueValue: requiredStringFromNull("Unique value requires manual review"),
  technologyStack: z.array(z.string()).default([]),
  keyFeatures: z.array(z.string()).default([]),
  productMaturity: requiredStringFromNull("Product maturity requires manual review"),
});

export type ProductEvaluation = z.infer<typeof ProductEvaluationSchema>;
