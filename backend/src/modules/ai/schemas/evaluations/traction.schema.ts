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

export const TractionEvaluationSchema = BaseEvaluationSchema.extend({
  metrics: z
    .object({
      users: optionalNonNegativeNumber,
      revenue: optionalNonNegativeNumber,
      growthRatePct: optionalNumber,
    })
    .default({}),
  customerValidation: z.string().min(1),
  growthTrajectory: z.string().min(1),
  revenueModel: z.string().min(1),
});

export type TractionEvaluation = z.infer<typeof TractionEvaluationSchema>;
