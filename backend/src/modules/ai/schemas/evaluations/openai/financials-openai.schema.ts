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

const ScenarioEntryOpenAiSchema = z.object({
  name: z.string(),
  value: z.number(),
});

const ScenarioComparisonPointOpenAiSchema = z.object({
  period: z.string(),
  scenarios: z.array(ScenarioEntryOpenAiSchema),
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
      raiseAmount: z
        .string()
        .nullable()
        .describe(
          "The raise amount as a bare monetary string ONLY — e.g. '$4M', '€2M', '$500K'. No justifications, context, or additional text. Null if not stated.",
        ),
      monthlyBurn: z
        .string()
        .nullable()
        .describe(
          "Monthly burn rate as a bare string ONLY — e.g. '$150K/mo', '$50K'. No additional text. Null if not stated.",
        ),
      runway: z
        .string()
        .nullable()
        .describe(
          "Runway as a bare string ONLY — e.g. '18 months', '24 months post-raise'. No additional text. Null if not stated.",
        ),
      runwayMonths: z
        .number()
        .nullable()
        .describe(
          "Runway as a number in months only — e.g. 18, 24. Null if not stated.",
        ),
      arr: z
        .string()
        .nullable()
        .describe(
          "ARR as a bare string ONLY — e.g. '$2M ARR', '$500K'. No additional text. Null if not stated.",
        ),
      annualRecurringRevenue: z
        .string()
        .nullable()
        .describe(
          "Annual recurring revenue as a bare string ONLY. Null if not stated.",
        ),
      grossMargin: z
        .string()
        .nullable()
        .describe(
          "Gross margin as a bare string ONLY — e.g. '72%', '65%'. No additional text. Null if not stated.",
        ),
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
