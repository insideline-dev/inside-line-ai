import { z } from "zod";
import { BaseEvaluationSchema } from "../base-evaluation.schema";
import { FounderPitchRecommendationSchema } from "../simple-evaluation.schema";

const ModelOverviewSchema = z.object({
  modelType: z.string().min(1).default("unclear"),
  pricingVisible: z.boolean().default(false),
  expansionMechanism: z.boolean().default(false),
  scalabilityAssessment: z.enum(["strong", "moderate", "weak", "unclear"]).default("unclear"),
  marginStructureDescribed: z.boolean().default(false),
}).default({
  modelType: "unclear",
  pricingVisible: false,
  expansionMechanism: false,
  scalabilityAssessment: "unclear",
  marginStructureDescribed: false,
});

export const BusinessModelEvaluationSchema = BaseEvaluationSchema.extend({
  modelOverview: z.preprocess((value) => value ?? {}, ModelOverviewSchema),
  founderPitchRecommendations: z.array(FounderPitchRecommendationSchema).default([]),
});

export type BusinessModelEvaluation = z.infer<typeof BusinessModelEvaluationSchema>;
