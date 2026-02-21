import { z } from "zod";
import { BaseEvaluationSchema } from "../base-evaluation.schema";

const requiredStringFromNull = (fallback: string) =>
  z.preprocess(
    (value) => (value == null ? fallback : value),
    z.string().min(1),
  );

const stringArray = z.preprocess(
  (value) =>
    Array.isArray(value)
      ? value.filter((item): item is string => typeof item === "string")
      : [],
  z.array(z.string()),
).default([]);

export const ProductEvaluationSchema = BaseEvaluationSchema.extend({
  productDescription: requiredStringFromNull("Product description requires manual review"),
  uniqueValue: requiredStringFromNull("Unique value requires manual review"),
  technologyStack: stringArray,
  keyFeatures: stringArray,
  productMaturity: requiredStringFromNull("Product maturity requires manual review"),
});

export type ProductEvaluation = z.infer<typeof ProductEvaluationSchema>;
