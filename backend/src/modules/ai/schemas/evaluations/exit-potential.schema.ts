import { z } from "zod";
import { BaseEvaluationSchema } from "../base-evaluation.schema";

export const ExitScenarioSchema = z.object({
  scenario: z.enum(["conservative", "moderate", "optimistic"]),
  exitType: z.enum(["IPO", "M&A", "IPO or M&A"]),
  exitValuation: z.string().min(1).default("Not provided"),
  timeline: z.string().min(1).default("Not provided"),
  moic: z.preprocess(
    (value) => (typeof value === "number" && Number.isFinite(value) ? value : 0),
    z.number(),
  ),
  irr: z.preprocess(
    (value) => (typeof value === "number" && Number.isFinite(value) ? value : 0),
    z.number(),
  ),
  researchBasis: z.string().min(1).default("Research basis pending"),
});

const ReturnAssessmentSchema = z.object({
  moderateReturnsAdequate: z.boolean().default(false),
  conservativeReturnsCapital: z.boolean().default(false),
  impliedGrowthRealistic: z.boolean().default(false),
  grossReturnsDisclaimer: z.string().min(1).default("Return analysis is directional and gross of fees, dilution, and liquidation preferences."),
}).default({
  moderateReturnsAdequate: false,
  conservativeReturnsCapital: false,
  impliedGrowthRealistic: false,
  grossReturnsDisclaimer: "Return analysis is directional and gross of fees, dilution, and liquidation preferences.",
});

export const ExitPotentialEvaluationSchema = BaseEvaluationSchema.extend({
  exitScenarios: z.preprocess(
    (value) => (Array.isArray(value) ? value : []),
    z.array(ExitScenarioSchema),
  ).default([]),
  returnAssessment: z.preprocess(
    (value) => value ?? {},
    ReturnAssessmentSchema,
  ),
});

export type ExitScenario = z.infer<typeof ExitScenarioSchema>;
export type ExitPotentialEvaluation = z.infer<typeof ExitPotentialEvaluationSchema>;
