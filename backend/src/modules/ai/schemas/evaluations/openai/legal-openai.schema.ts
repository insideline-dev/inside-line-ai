// OpenAI strict mode: no preprocess, no default. Mirrors LegalEvaluationSchema shape.
import { z } from "zod";
import {
  BaseEvaluationOpenAiSchema,
  FounderPitchRecommendationOpenAiSchema,
} from "../../base-evaluation-openai.schema";

const RedFlagOpenAiSchema = z.object({
  flag: z.string(),
  source: z.string(),
  severity: z.enum(["critical", "notable", "minor"]),
});

const LegalOverviewOpenAiSchema = z.object({
  redFlagsFound: z.boolean(),
  redFlagCount: z.number().int().min(0),
  redFlagDetails: z.array(RedFlagOpenAiSchema),
  complianceCertifications: z.array(z.string()),
  regulatoryOutlook: z.enum(["favorable", "neutral", "headwinds", "blocking"]),
  ipVerified: z.boolean().nullable(),
});

export const LegalEvaluationOpenAiSchema = BaseEvaluationOpenAiSchema.extend({
  legalOverview: LegalOverviewOpenAiSchema,
  founderPitchRecommendations: z.array(FounderPitchRecommendationOpenAiSchema),
});
