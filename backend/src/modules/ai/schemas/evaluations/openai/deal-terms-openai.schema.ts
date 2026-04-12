// OpenAI strict mode: no preprocess, no default. Mirrors DealTermsEvaluationSchema shape.
import { z } from "zod";
import { BaseEvaluationOpenAiSchema } from "../../base-evaluation-openai.schema";

const DealOverviewOpenAiSchema = z.object({
  impliedMultiple: z.string().nullable(),
  comparableRange: z.string().nullable(),
  premiumDiscount: z.enum(["significant_premium", "slight_premium", "in_line", "slight_discount", "significant_discount", "insufficient_data"]),
  roundType: z.string(),
  raiseSizeAssessment: z.enum(["large_for_stage", "typical", "small_for_stage", "insufficient_data"]),
  valuationProvided: z.boolean(),
});

export const DealTermsEvaluationOpenAiSchema =
  BaseEvaluationOpenAiSchema.extend({
    dealOverview: DealOverviewOpenAiSchema,
  });
