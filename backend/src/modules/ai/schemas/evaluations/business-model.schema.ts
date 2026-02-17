import { z } from "zod";
import { BaseEvaluationSchema } from "../base-evaluation.schema";

const requiredStringFromNull = (fallback: string) =>
  z.preprocess(
    (value) => (value === null ? fallback : value),
    z.string().min(1),
  );

export const BusinessModelEvaluationSchema = BaseEvaluationSchema.extend({
  revenueStreams: z.array(z.string()).default([]),
  unitEconomics: requiredStringFromNull("Unit economics require manual review"),
  scalability: requiredStringFromNull("Scalability assessment unavailable"),
  defensibility: requiredStringFromNull("Defensibility assessment unavailable"),
});

export type BusinessModelEvaluation = z.infer<
  typeof BusinessModelEvaluationSchema
>;
