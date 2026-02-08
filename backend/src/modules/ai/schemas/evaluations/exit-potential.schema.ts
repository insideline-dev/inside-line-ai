import { z } from "zod";
import { BaseEvaluationSchema } from "../base-evaluation.schema";

export const ExitPotentialEvaluationSchema = BaseEvaluationSchema.extend({
  exitScenarios: z.array(z.string()).default([]),
  acquirers: z.array(z.string()).default([]),
  exitTimeline: z.string().min(1),
  returnPotential: z.string().min(1),
});

export type ExitPotentialEvaluation = z.infer<
  typeof ExitPotentialEvaluationSchema
>;
