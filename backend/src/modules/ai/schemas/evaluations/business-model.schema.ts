import { z } from "zod";
import { BaseEvaluationSchema } from "../base-evaluation.schema";

const requiredStringFromNull = (fallback: string) =>
  z.preprocess(
    (value) => (value === null ? fallback : value),
    z.string().min(1),
  );

const stringArray = z.preprocess(
  (value) =>
    Array.isArray(value)
      ? value.filter((item): item is string => typeof item === "string")
      : [],
  z.array(z.string()),
).default([]);

export const BusinessModelEvaluationSchema = BaseEvaluationSchema.extend({
  revenueStreams: stringArray,
  unitEconomics: requiredStringFromNull("Unit economics require manual review"),
  scalability: requiredStringFromNull("Scalability assessment unavailable"),
  defensibility: requiredStringFromNull("Defensibility assessment unavailable"),
});

export type BusinessModelEvaluation = z.infer<
  typeof BusinessModelEvaluationSchema
>;
