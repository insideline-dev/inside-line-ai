import { z } from "zod";
import { BaseEvaluationSchema } from "../base-evaluation.schema";

const nullableString = z.preprocess(
  (value) => {
    if (value == null) return null;
    if (typeof value === "string") {
      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : null;
    }
    return String(value);
  },
  z.string().nullable(),
);

export const DealTermsEvaluationSchema = BaseEvaluationSchema.extend({
  dealOverview: z.preprocess(
    (value) => value ?? {},
    z.object({
      impliedMultiple: nullableString.default(null),
      comparableRange: nullableString.default(null),
      premiumDiscount: z.enum([
        "significant_premium",
        "slight_premium",
        "in_line",
        "slight_discount",
        "significant_discount",
        "insufficient_data",
      ]).default("insufficient_data"),
      roundType: z.string().min(1).default("Unknown"),
      raiseSizeAssessment: z.enum([
        "large_for_stage",
        "typical",
        "small_for_stage",
        "insufficient_data",
      ]).default("insufficient_data"),
      valuationProvided: z.boolean().default(false),
    }),
  ),
});

export type DealTermsEvaluation = z.infer<typeof DealTermsEvaluationSchema>;
