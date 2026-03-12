import { z } from "zod";
import {
  BaseEvaluationSchema,
  requiredStringFromNull,
  stringArray,
} from "../base-evaluation.schema";
import { FounderPitchRecommendationSchema } from "../simple-evaluation.schema";

export const ProductOverviewSchema = z.object({
  whatItDoes: requiredStringFromNull("Unknown"),
  targetUser: requiredStringFromNull("Unknown"),
  productCategory: requiredStringFromNull("Unknown"),
  coreValueProp: requiredStringFromNull("Unknown"),
  description: requiredStringFromNull("Product description pending"),
  techStage: z.enum([
    "concept",
    "prototype",
    "mvp",
    "beta",
    "production",
    "scaling",
  ]).default("concept"),
}).default({
  whatItDoes: "Unknown",
  targetUser: "Unknown",
  productCategory: "Unknown",
  coreValueProp: "Unknown",
  description: "Product description pending",
  techStage: "concept",
});

export const ProductClaimAssessmentSchema = z.object({
  claim: requiredStringFromNull("Claim not specified"),
  deckSays: requiredStringFromNull("Deck support not provided"),
  evidence: requiredStringFromNull("Evidence not provided"),
  verdict: z.enum([
    "verified",
    "partially_verified",
    "unverified",
    "contradicted",
  ]).default("unverified"),
});

export const ProductFeatureSchema = z.object({
  feature: requiredStringFromNull("Feature not specified"),
  verifiedBy: z.preprocess(
    (value) => (Array.isArray(value) ? value : typeof value === "string" ? [value] : []),
    z.array(z.enum(["deck", "website", "research"])),
  ).default([]),
});

export const ProductTechnologySchema = z.object({
  technology: requiredStringFromNull("Technology not specified"),
  source: z.enum(["deck", "website", "research"]).default("research"),
});

export const ProductEvaluationSchema = BaseEvaluationSchema.extend({
  productOverview: ProductOverviewSchema,
  stageFitAssessment: z.enum(["ahead", "on_track", "behind"]).default("on_track"),
  claimsAssessment: z.array(ProductClaimAssessmentSchema).default([]),
  strengths: stringArray,
  risks: stringArray,
  keyFeatures: z.array(ProductFeatureSchema).default([]),
  technologyStack: z.array(ProductTechnologySchema).default([]),
  founderPitchRecommendations: z.array(FounderPitchRecommendationSchema).default([]),
});

export type ProductEvaluation = z.infer<typeof ProductEvaluationSchema>;
