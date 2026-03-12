import { z } from "zod";
import { BaseEvaluationSchema } from "../base-evaluation.schema";
import { FounderPitchRecommendationSchema } from "../simple-evaluation.schema";

const GtmOverviewSchema = z.object({
  strategyType: z.string().min(1).default("unclear"),
  evidenceAlignment: z.enum(["strong", "partial", "weak", "none"]).default("none"),
  channelDiversification: z.boolean().default(false),
  scalabilityAssessment: z.enum(["strong", "moderate", "weak", "unclear"]).default("unclear"),
}).default({
  strategyType: "unclear",
  evidenceAlignment: "none",
  channelDiversification: false,
  scalabilityAssessment: "unclear",
});

export const GtmEvaluationSchema = BaseEvaluationSchema.extend({
  gtmOverview: z.preprocess((value) => value ?? {}, GtmOverviewSchema),
  founderPitchRecommendations: z.array(FounderPitchRecommendationSchema).default([]),
});

export type GtmEvaluation = z.infer<typeof GtmEvaluationSchema>;
