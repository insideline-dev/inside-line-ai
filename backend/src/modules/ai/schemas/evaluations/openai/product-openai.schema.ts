// OpenAI strict mode: no preprocess, no default. Mirrors *Schema shape.
import { z } from "zod";
import {
  BaseEvaluationOpenAiSchema,
  FounderPitchRecommendationOpenAiSchema,
} from "../../base-evaluation-openai.schema";

const ProductOverviewOpenAiSchema = z.object({
  whatItDoes: z.string(),
  targetUser: z.string(),
  productCategory: z.string(),
  coreValueProp: z.string(),
  description: z.string(),
  techStage: z.enum([
    "concept",
    "prototype",
    "mvp",
    "beta",
    "production",
    "scaling",
  ]),
});

const ProductClaimAssessmentOpenAiSchema = z.object({
  claim: z.string(),
  deckSays: z.string(),
  evidence: z.string(),
  verdict: z.enum([
    "verified",
    "partially_verified",
    "unverified",
    "contradicted",
  ]),
});

const ProductFeatureOpenAiSchema = z.object({
  feature: z.string(),
  verifiedBy: z.array(z.enum(["deck", "website", "research"])),
});

const ProductTechnologyOpenAiSchema = z.object({
  technology: z.string(),
  source: z.enum(["deck", "website", "research"]),
});

export const ProductEvaluationOpenAiSchema = BaseEvaluationOpenAiSchema.extend({
  productOverview: ProductOverviewOpenAiSchema,
  stageFitAssessment: z.enum(["ahead", "on_track", "behind"]),
  claimsAssessment: z.array(ProductClaimAssessmentOpenAiSchema),
  strengths: z.array(z.string()),
  risks: z.array(z.string()),
  keyFeatures: z.array(ProductFeatureOpenAiSchema),
  technologyStack: z.array(ProductTechnologyOpenAiSchema),
  founderPitchRecommendations: z.array(FounderPitchRecommendationOpenAiSchema),
});
