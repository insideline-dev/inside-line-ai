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

export const GtmEvaluationSchema = BaseEvaluationSchema.extend({
  customerSegments: stringArray,
  acquisitionChannels: stringArray,
  salesStrategy: requiredStringFromNull("Sales strategy requires manual review"),
  pricingStrategy: requiredStringFromNull("Pricing strategy requires manual review"),
});

export type GtmEvaluation = z.infer<typeof GtmEvaluationSchema>;
