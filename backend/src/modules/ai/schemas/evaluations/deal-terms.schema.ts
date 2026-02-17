import { z } from "zod";
import { BaseEvaluationSchema } from "../base-evaluation.schema";

const nullToUndefined = (value: unknown): unknown =>
  value === null ? undefined : value;

const optionalNonNegativeNumber = z.preprocess(
  nullToUndefined,
  z.number().nonnegative().optional(),
);

const optionalEquityPercent = z.preprocess(
  nullToUndefined,
  z.number().min(0).max(100).optional(),
);

export const DealTermsEvaluationSchema = BaseEvaluationSchema.extend({
  valuation: optionalNonNegativeNumber,
  askAmount: optionalNonNegativeNumber,
  equity: optionalEquityPercent,
  termsQuality: z.string().min(1),
});

export type DealTermsEvaluation = z.infer<typeof DealTermsEvaluationSchema>;
