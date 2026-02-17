import { z } from "zod";
import { BaseEvaluationSchema } from "../base-evaluation.schema";

const requiredStringFromNull = (fallback: string) =>
  z.preprocess(
    (value) => (value === null ? fallback : value),
    z.string().min(1),
  );

export const GtmEvaluationSchema = BaseEvaluationSchema.extend({
  customerSegments: z.array(z.string()).default([]),
  acquisitionChannels: z.array(z.string()).default([]),
  salesStrategy: requiredStringFromNull("Sales strategy requires manual review"),
  pricingStrategy: requiredStringFromNull("Pricing strategy requires manual review"),
});

export type GtmEvaluation = z.infer<typeof GtmEvaluationSchema>;
