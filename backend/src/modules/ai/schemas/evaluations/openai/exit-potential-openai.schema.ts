// OpenAI strict mode: no preprocess, no default. Mirrors ExitPotentialEvaluationSchema shape.
import { z } from "zod";
import { BaseEvaluationOpenAiSchema } from "../../base-evaluation-openai.schema";

const ExitScenarioOpenAiSchema = z.object({
  scenario: z.enum(["conservative", "moderate", "optimistic"]),
  exitType: z.enum(["IPO", "M&A", "IPO or M&A"]),
  exitValuation: z.string(),
  timeline: z.string(),
  moic: z.number(),
  irr: z.number(),
  researchBasis: z.string(),
});

const ReturnAssessmentOpenAiSchema = z.object({
  moderateReturnsAdequate: z.boolean(),
  conservativeReturnsCapital: z.boolean(),
  impliedGrowthRealistic: z.boolean(),
  grossReturnsDisclaimer: z.string(),
});

export const ExitPotentialEvaluationOpenAiSchema =
  BaseEvaluationOpenAiSchema.extend({
    exitScenarios: z.array(ExitScenarioOpenAiSchema),
    returnAssessment: ReturnAssessmentOpenAiSchema,
  });
