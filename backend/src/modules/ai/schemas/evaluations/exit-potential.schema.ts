import { z } from "zod";
import { SimpleEvaluationSchema } from "../simple-evaluation.schema";

export const ExitScenarioSchema = z.object({
  scenario: z.enum(["conservative", "moderate", "optimistic"]),
  exitType: z.string(),
  exitValuation: z.string(),
  timeline: z.string(),
  moic: z.number(),
  irr: z.number(),
  researchBasis: z.string(),
});

export const ExitPotentialEvaluationSchema = SimpleEvaluationSchema.extend({
  exitScenarios: z.array(ExitScenarioSchema),
});

export type ExitScenario = z.infer<typeof ExitScenarioSchema>;
export type ExitPotentialEvaluation = z.infer<
  typeof ExitPotentialEvaluationSchema
>;
