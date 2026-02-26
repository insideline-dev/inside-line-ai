import { z } from "zod";
import { BaseEvaluationSchema } from "../base-evaluation.schema";

const nullToUndefined = (value: unknown): unknown =>
  value === null ? undefined : value;

const optionalNonNegativeNumber = z.preprocess(
  nullToUndefined,
  z.number().nonnegative().optional(),
);

const optionalNumber = z.preprocess(
  nullToUndefined,
  z.number().optional(),
);

const requiredStringFromNull = (fallback: string) =>
  z.preprocess(
    (value) => (value == null ? fallback : value),
    z.string().min(1),
  );

export const TractionEvaluationSchema = BaseEvaluationSchema.extend({
  metrics: z
    .object({
      users: optionalNonNegativeNumber,
      revenue: optionalNonNegativeNumber,
      growthRatePct: optionalNumber,
    })
    .default({}),
  customerValidation: requiredStringFromNull("Customer validation requires manual review"),
  growthTrajectory: requiredStringFromNull("Growth trajectory requires manual review"),
  revenueModel: requiredStringFromNull("Revenue model requires manual review"),
});

export type TractionEvaluation = z.infer<typeof TractionEvaluationSchema>;
