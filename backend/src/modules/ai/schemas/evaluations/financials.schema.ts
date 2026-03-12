import { z } from "zod";
import { BaseEvaluationSchema } from "../base-evaluation.schema";
import { FounderPitchRecommendationSchema } from "../simple-evaluation.schema";

const nullableString = z.preprocess(
  (value) => {
    if (value == null) return null;
    if (typeof value === "string") {
      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : null;
    }
    return String(value);
  },
  z.string().nullable(),
);

const nullableNumber = z.preprocess(
  (value) => {
    if (value == null || value === "") return null;
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
      const parsed = Number(value.replace(/[$,%\s,]/g, ""));
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  },
  z.number().nullable(),
);

const UseOfFundsSchema = z.object({
  category: z.string().min(1).default("Unspecified"),
  percentage: z.preprocess(
    (value) => {
      if (typeof value === "number" && Number.isFinite(value)) return value;
      if (typeof value === "string") {
        const parsed = Number(value.replace(/%/g, "").trim());
        if (Number.isFinite(parsed)) return parsed;
      }
      return 0;
    },
    z.number(),
  ),
});

const ProjectionAssumptionSchema = z.object({
  assumption: z.string().min(1).default("Unspecified assumption"),
  value: z.string().min(1).default("Not provided"),
  assessment: z.string().min(1).default("Assessment pending"),
  verdict: z.enum(["reasonable", "aggressive", "unsupported", "conservative"]).default("unsupported"),
});

const RevenueProjectionPointSchema = z.object({
  period: z.string().min(1).default("Unknown"),
  revenue: z.preprocess(
    (value) => (typeof value === "number" && Number.isFinite(value) ? value : 0),
    z.number(),
  ),
});

const BurnProjectionPointSchema = z.object({
  period: z.string().min(1).default("Unknown"),
  burn: z.preprocess(
    (value) => (typeof value === "number" && Number.isFinite(value) ? value : 0),
    z.number(),
  ),
  cashBalance: z.preprocess(
    (value) => (typeof value === "number" && Number.isFinite(value) ? value : 0),
    z.number(),
  ),
});

const ScenarioComparisonPointSchema = z.object({
  period: z.string().min(1).default("Unknown"),
  scenarios: z.record(z.string(), z.number()).default({}),
});

const MarginProgressionPointSchema = z.object({
  period: z.string().min(1).default("Unknown"),
  grossMargin: z.preprocess(
    (value) => (typeof value === "number" && Number.isFinite(value) ? value : 0),
    z.number(),
  ),
  operatingMargin: z.preprocess(
    (value) => (typeof value === "number" && Number.isFinite(value) ? value : 0),
    z.number(),
  ),
});

const DiligenceFlagSchema = z.object({
  flag: z.string().min(1).default("Flag pending"),
  priority: z.enum(["critical", "important", "routine"]).default("important"),
});

export const FinancialsEvaluationSchema = BaseEvaluationSchema.extend({
  financialModelProvided: z.boolean().default(false),
  keyMetrics: z.preprocess(
    (value) => value ?? {},
    z.object({
      raiseAmount: nullableString.default(null),
      monthlyBurn: nullableString.default(null),
      runway: nullableString.default(null),
      runwayMonths: nullableNumber.default(null),
    }),
  ),
  capitalPlan: z.preprocess(
    (value) => value ?? {},
    z.object({
      burnPlanDescribed: z.boolean().default(false),
      useOfFundsDescribed: z.boolean().default(false),
      runwayEstimated: z.boolean().default(false),
      raiseJustified: z.boolean().default(false),
      milestoneTied: z.boolean().default(false),
      capitalEfficiencyAddressed: z.boolean().default(false),
      milestoneAlignment: z.enum(["strong", "partial", "weak", "none"]).default("none"),
      useOfFundsBreakdown: z.array(UseOfFundsSchema).default([]),
      summary: z.string().min(1).default("Capital plan assessment pending"),
    }),
  ),
  projections: z.preprocess(
    (value) => value ?? {},
    z.object({
      provided: z.boolean().default(false),
      assumptionsStated: z.boolean().default(false),
      internallyConsistent: z.boolean().default(false),
      credibility: z.enum(["strong", "moderate", "weak", "none"]).default("none"),
      summary: z.string().min(1).default("Projection assessment pending"),
      scenarioAnalysis: z.boolean().default(false),
      scenarioDetail: z.string().min(1).default("Scenario detail not provided"),
      assumptionAssessment: z.string().min(1).default("Assumption assessment pending"),
      assumptions: z.array(ProjectionAssumptionSchema).default([]),
      profitabilityPath: z.enum([
        "pre-revenue",
        "revenue-not-profitable",
        "path-described",
        "path-clear",
        "profitable",
      ]).default("pre-revenue"),
    }),
  ),
  charts: z.preprocess(
    (value) => value ?? {},
    z.object({
      revenueProjection: z.array(RevenueProjectionPointSchema).default([]),
      burnProjection: z.array(BurnProjectionPointSchema).default([]),
      scenarioComparison: z.array(ScenarioComparisonPointSchema).default([]),
      marginProgression: z.array(MarginProgressionPointSchema).default([]),
    }),
  ),
  financialPlanning: z.preprocess(
    (value) => value ?? {},
    z.object({
      sophisticationLevel: z.enum([
        "basic",
        "developing",
        "solid",
        "advanced",
        "ipo-grade",
      ]).default("basic"),
      diligenceFlags: z.array(DiligenceFlagSchema).default([]),
      summary: z.string().min(1).default("Financial planning assessment pending"),
    }),
  ),
  founderPitchRecommendations: z.array(FounderPitchRecommendationSchema).default([]),
});

export type FinancialsEvaluation = z.infer<typeof FinancialsEvaluationSchema>;
