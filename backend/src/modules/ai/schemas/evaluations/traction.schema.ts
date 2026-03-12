import { z } from "zod";
import { BaseEvaluationSchema } from "../base-evaluation.schema";
import { FounderPitchRecommendationSchema } from "../simple-evaluation.schema";

const TractionOverviewSchema = z.object({
  metricsDepth: z.enum(["comprehensive", "partial", "minimal", "none"]).default("none"),
  stageFit: z.enum(["strong", "adequate", "weak", "insufficient"]).default("insufficient"),
  hasRevenue: z.boolean().default(false),
  hasGrowthRate: z.boolean().default(false),
  hasRetention: z.boolean().default(false),
  hasUnitEconomics: z.boolean().default(false),
  hasCohortData: z.boolean().default(false),
}).default({
  metricsDepth: "none",
  stageFit: "insufficient",
  hasRevenue: false,
  hasGrowthRate: false,
  hasRetention: false,
  hasUnitEconomics: false,
  hasCohortData: false,
});

export const TractionEvaluationSchema = BaseEvaluationSchema.extend({
  tractionOverview: z.preprocess(
    (value) => value ?? {},
    TractionOverviewSchema,
  ),
  founderPitchRecommendations: z.array(FounderPitchRecommendationSchema).default([]),
});

export type TractionEvaluation = z.infer<typeof TractionEvaluationSchema>;
