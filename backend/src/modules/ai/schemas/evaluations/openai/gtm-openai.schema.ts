// OpenAI strict mode: no preprocess, no default. Mirrors GtmEvaluationSchema shape.
import { z } from "zod";
import {
  BaseEvaluationOpenAiSchema,
  FounderPitchRecommendationOpenAiSchema,
} from "../../base-evaluation-openai.schema";

const GtmOverviewOpenAiSchema = z.object({
  strategyType: z.string(),
  evidenceAlignment: z.enum(["strong", "partial", "weak", "none"]),
  channelDiversification: z.boolean(),
  scalabilityAssessment: z.enum(["strong", "moderate", "weak", "unclear"]),
});

export const GtmEvaluationOpenAiSchema = BaseEvaluationOpenAiSchema.extend({
  gtmOverview: GtmOverviewOpenAiSchema,
  founderPitchRecommendations: z.array(FounderPitchRecommendationOpenAiSchema),
});
