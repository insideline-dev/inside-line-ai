// OpenAI strict mode: no preprocess, no default. Mirrors *Schema shape.
import { z } from "zod";
import {
  BaseEvaluationOpenAiSchema,
  FounderPitchRecommendationOpenAiSchema,
} from "../../base-evaluation-openai.schema";

const TeamMemberOpenAiSchema = z.object({
  name: z.string(),
  role: z.string(),
  relevance: z.string(),
  strengths: z.array(z.string()),
  risks: z.array(z.string()),
});

const FounderRecommendationOpenAiSchema = z.object({
  action: z.string(),
  recommendation: z.string(),
});

const TeamCompositionOpenAiSchema = z.object({
  businessLeadership: z.boolean(),
  technicalCapability: z.boolean(),
  domainExpertise: z.boolean(),
  gtmCapability: z.boolean(),
  sentence: z.string(),
  reason: z.string(),
});

const FounderMarketFitOpenAiSchema = z.object({
  score: z.number().int().min(0).max(100),
  why: z.string(),
});

export const TeamEvaluationOpenAiSchema = BaseEvaluationOpenAiSchema.extend({
  founderMarketFit: FounderMarketFitOpenAiSchema,
  teamComposition: TeamCompositionOpenAiSchema,
  strengths: z.array(z.string()),
  teamMembers: z.array(TeamMemberOpenAiSchema),
  founderRecommendations: z.array(FounderRecommendationOpenAiSchema),
  founderPitchRecommendations: z.array(FounderPitchRecommendationOpenAiSchema),
});
