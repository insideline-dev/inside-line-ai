// OpenAI strict mode: no preprocess, no default. Mirrors BusinessModelEvaluationSchema shape.
import { z } from "zod";
import {
  BaseEvaluationOpenAiSchema,
  FounderPitchRecommendationOpenAiSchema,
} from "../../base-evaluation-openai.schema";

const ModelOverviewOpenAiSchema = z.object({
  modelType: z.string(),
  pricingVisible: z.boolean(),
  expansionMechanism: z.boolean(),
  scalabilityAssessment: z.enum(["strong", "moderate", "weak", "unclear"]),
  marginStructureDescribed: z.boolean(),
});

export const BusinessModelEvaluationOpenAiSchema =
  BaseEvaluationOpenAiSchema.extend({
    modelOverview: ModelOverviewOpenAiSchema,
    founderPitchRecommendations: z.array(
      FounderPitchRecommendationOpenAiSchema,
    ),
  });
