import { z } from "zod";
import { BaseEvaluationSchema } from "./base-evaluation.schema";

export const FounderPitchRecommendationSchema = z.object({
  deckMissingElement: z.string().min(1),
  whyItMatters: z.string().min(1),
  recommendation: z.string().min(1),
});

export type FounderPitchRecommendation = z.infer<typeof FounderPitchRecommendationSchema>;

/** traction, deal-terms, exit-potential */
export const SimpleEvaluationSchema = BaseEvaluationSchema;
export type SimpleEvaluation = z.infer<typeof SimpleEvaluationSchema>;

/** business-model, gtm, financials, legal */
export const SimpleEvaluationWithRecsSchema = BaseEvaluationSchema.extend({
  founderPitchRecommendations: z.array(FounderPitchRecommendationSchema).default([]),
});
export type SimpleEvaluationWithRecs = z.infer<typeof SimpleEvaluationWithRecsSchema>;
