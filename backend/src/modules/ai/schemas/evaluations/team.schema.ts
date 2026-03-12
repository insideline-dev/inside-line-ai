import { z } from "zod";
import {
  BaseEvaluationSchema,
  requiredStringFromNull,
  stringArray,
} from "../base-evaluation.schema";
import { FounderPitchRecommendationSchema } from "../simple-evaluation.schema";

const teamMemberRawSchema = z.object({
  name: requiredStringFromNull("Unknown member"),
  role: requiredStringFromNull("Unknown role"),
  relevance: requiredStringFromNull("Relevance unavailable"),
  strengths: stringArray,
  risks: stringArray,
});

export const TeamMemberEvaluationSchema = z.preprocess((value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }
  const record = value as Record<string, unknown>;
  return {
    ...record,
    relevance:
      record.relevance ??
      record.background ??
      "Relevance unavailable",
    risks: record.risks ?? record.concerns ?? [],
  };
}, teamMemberRawSchema);

export const FounderRecommendationSchema = z.object({
  action: requiredStringFromNull("Recommendation"),
  recommendation: requiredStringFromNull("Recommendation pending"),
});

export type FounderRecommendation = z.infer<typeof FounderRecommendationSchema>;

const TeamCompositionDefaults = {
  businessLeadership: false,
  technicalCapability: false,
  domainExpertise: false,
  gtmCapability: false,
  sentence: "Team composition assessment pending",
  reason: "Team composition assessment pending",
} as const;

export const TeamCompositionSchema = z.object({
  businessLeadership: z.boolean().default(false),
  technicalCapability: z.boolean().default(false),
  domainExpertise: z.boolean().default(false),
  gtmCapability: z.boolean().default(false),
  sentence: requiredStringFromNull("Team composition assessment pending"),
  reason: requiredStringFromNull("Coverage assessment pending"),
}).default(TeamCompositionDefaults);

export const FounderMarketFitSchema = z.object({
  score: z.number().int().min(0).max(100),
  why: requiredStringFromNull("Founder-market fit assessment pending"),
}).default({ score: 50, why: "Founder-market fit assessment pending" });

const TeamEvaluationRawSchema = BaseEvaluationSchema.extend({
  founderMarketFit: FounderMarketFitSchema,
  teamComposition: TeamCompositionSchema,
  strengths: stringArray,
  teamMembers: z.array(TeamMemberEvaluationSchema).default([]),
  founderRecommendations: z.array(FounderRecommendationSchema).default([]),
  founderPitchRecommendations: z.array(FounderPitchRecommendationSchema).default([]),
});

export const TeamEvaluationSchema = TeamEvaluationRawSchema;

export type TeamEvaluation = z.infer<typeof TeamEvaluationSchema>;
