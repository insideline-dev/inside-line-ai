import { z } from "zod";
import { BaseEvaluationSchema, requiredStringFromNull, stringArray } from "../base-evaluation.schema";
import { FounderPitchRecommendationSchema } from "../simple-evaluation.schema";

export const ProductSummarySchema = z.object({
  description: requiredStringFromNull("Product description pending"),
  techStage: z.enum(["mature", "mvp", "idea", "scaling"]).default("idea"),
}).default({ description: "Product description pending", techStage: "idea" });

export const ProductOverviewSchema = z.object({
  whatItDoes: requiredStringFromNull("Unknown"),
  targetUser: requiredStringFromNull("Unknown"),
  productCategory: requiredStringFromNull("Unknown"),
  coreValueProp: requiredStringFromNull("Unknown"),
}).default({ whatItDoes: "Unknown", targetUser: "Unknown", productCategory: "Unknown", coreValueProp: "Unknown" });

export const ProductStrengthsAndRisksSchema = z.object({
  strengths: stringArray,
  risks: stringArray,
}).default({ strengths: [], risks: [] });

export const ProductEvaluationSchema = BaseEvaluationSchema.extend({
  productSummary: ProductSummarySchema,
  productOverview: ProductOverviewSchema,
  productStrengthsAndRisks: ProductStrengthsAndRisksSchema,
  strengths: stringArray,
  risks: stringArray,
  keyFeatures: stringArray,
  technologyStack: stringArray,
  founderPitchRecommendations: z.array(FounderPitchRecommendationSchema).default([]),
});

export type ProductEvaluation = z.infer<typeof ProductEvaluationSchema>;
