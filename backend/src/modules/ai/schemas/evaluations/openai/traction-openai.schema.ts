// OpenAI strict mode: no preprocess, no default. Mirrors TractionEvaluationSchema shape.
import { z } from "zod";
import {
  BaseEvaluationOpenAiSchema,
  FounderPitchRecommendationOpenAiSchema,
} from "../../base-evaluation-openai.schema";

const TractionOverviewOpenAiSchema = z.object({
  metricsDepth: z.enum(["comprehensive", "partial", "minimal", "none"]),
  stageFit: z.enum(["strong", "adequate", "weak", "insufficient"]),
  hasRevenue: z.boolean(),
  hasGrowthRate: z.boolean(),
  hasRetention: z.boolean(),
  hasUnitEconomics: z.boolean(),
  hasCohortData: z.boolean(),
});

export const TractionEvaluationOpenAiSchema = BaseEvaluationOpenAiSchema.extend(
  {
    tractionOverview: TractionOverviewOpenAiSchema,
    founderPitchRecommendations: z.array(
      FounderPitchRecommendationOpenAiSchema,
    ),
  },
);
