import { z } from "zod";
import { BaseEvaluationSchema, requiredStringFromNull } from "../base-evaluation.schema";

const requiredBooleanFromNull = (fallback: boolean) =>
  z.preprocess(
    (value) => (typeof value === "boolean" ? value : fallback),
    z.boolean(),
  );

export const ExitScenarioSchema = z.object({
  scenario: z.enum(["conservative", "moderate", "optimistic"]),
  exitType: z.enum(["IPO", "M&A", "IPO or M&A"]),
  exitValuation: requiredStringFromNull("Not provided"),
  timeline: requiredStringFromNull("Not provided"),
  moic: z.preprocess(
    (value) => (typeof value === "number" && Number.isFinite(value) ? value : 0),
    z.number(),
  ),
  irr: z.preprocess(
    (value) => (typeof value === "number" && Number.isFinite(value) ? value : 0),
    z.number(),
  ),
  researchBasis: requiredStringFromNull("Research basis pending"),
});

const ReturnAssessmentSchema = z.object({
  moderateReturnsAdequate: requiredBooleanFromNull(false),
  conservativeReturnsCapital: requiredBooleanFromNull(false),
  impliedGrowthRealistic: requiredBooleanFromNull(false),
  grossReturnsDisclaimer: requiredStringFromNull(
    "Return analysis is directional and gross of fees, dilution, and liquidation preferences.",
  ),
});

export const ExitPotentialEvaluationSchema = BaseEvaluationSchema.extend({
  exitScenarios: z.preprocess(
    (value) => (Array.isArray(value) ? value : []),
    z.array(ExitScenarioSchema),
  ),
  returnAssessment: z.preprocess(
    (value) => value ?? {},
    ReturnAssessmentSchema,
  ),
});

export type ExitScenario = z.infer<typeof ExitScenarioSchema>;
export type ExitPotentialEvaluation = z.infer<typeof ExitPotentialEvaluationSchema>;
