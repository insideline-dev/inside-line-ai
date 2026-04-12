// OpenAI strict mode: no preprocess, no default. Mirrors FinancialsEvaluationSchema shape.
import { z } from "zod";
import {
  BaseEvaluationOpenAiSchema,
  FounderPitchRecommendationOpenAiSchema,
} from "../../base-evaluation-openai.schema";

const UseOfFundsOpenAiSchema = z.object({
  category: z.string(),
  percentage: z.number(),
});

const ProjectionAssumptionOpenAiSchema = z.object({
  assumption: z.string(),
  value: z.string(),
  assessment: z.string(),
  verdict: z.enum(["reasonable", "aggressive", "unsupported", "conservative"]),
});

const RevenueProjectionPointOpenAiSchema = z.object({
  period: z.string(),
  revenue: z.number(),
});

const BurnProjectionPointOpenAiSchema = z.object({
  period: z.string(),
  burn: z.number(),
  cashBalance: z.number(),
});

const ScenarioComparisonPointOpenAiSchema = z.object({
  period: z.string(),
  scenarios: z.record(z.string(), z.number()),
});

const MarginProgressionPointOpenAiSchema = z.object({
  period: z.string(),
  grossMargin: z.number(),
  operatingMargin: z.number(),
});

const DiligenceFlagOpenAiSchema = z.object({
  flag: z.string(),
  priority: z.enum(["critical", "important", "routine"]),
});

export const FinancialsEvaluationOpenAiSchema =
  BaseEvaluationOpenAiSchema.extend({
    financialModelProvided: z.boolean(),
    keyMetrics: z.object({
      raiseAmount: z.string().nullable(),
      monthlyBurn: z.string().nullable(),
      runway: z.string().nullable(),
      runwayMonths: z.number().nullable(),
      arr: z.string().nullable(),
      annualRecurringRevenue: z.string().nullable(),
      grossMargin: z.string().nullable(),
    }),
    capitalPlan: z.object({
      burnPlanDescribed: z.boolean(),
      useOfFundsDescribed: z.boolean(),
      runwayEstimated: z.boolean(),
      raiseJustified: z.boolean(),
      milestoneTied: z.boolean(),
      capitalEfficiencyAddressed: z.boolean(),
      milestoneAlignment: z.enum(["strong", "partial", "weak", "none"]),
      useOfFundsBreakdown: z.array(UseOfFundsOpenAiSchema),
      summary: z.string(),
    }),
    projections: z.object({
      provided: z.boolean(),
      assumptionsStated: z.boolean(),
      internallyConsistent: z.boolean(),
      credibility: z.enum(["strong", "moderate", "weak", "none"]),
      summary: z.string(),
      scenarioAnalysis: z.boolean(),
      scenarioDetail: z.string(),
      assumptionAssessment: z.string(),
      assumptions: z.array(ProjectionAssumptionOpenAiSchema),
      profitabilityPath: z.enum([
        "pre-revenue",
        "revenue-not-profitable",
        "path-described",
        "path-clear",
        "profitable",
      ]),
    }),
    charts: z.object({
      revenueProjection: z.array(RevenueProjectionPointOpenAiSchema),
      burnProjection: z.array(BurnProjectionPointOpenAiSchema),
      scenarioComparison: z.array(ScenarioComparisonPointOpenAiSchema),
      marginProgression: z.array(MarginProgressionPointOpenAiSchema),
    }),
    financialPlanning: z.object({
      sophisticationLevel: z.enum([
        "basic",
        "developing",
        "solid",
        "advanced",
        "ipo-grade",
      ]),
      diligenceFlags: z.array(DiligenceFlagOpenAiSchema),
      summary: z.string(),
    }),
    founderPitchRecommendations: z.array(
      FounderPitchRecommendationOpenAiSchema,
    ),
  });
