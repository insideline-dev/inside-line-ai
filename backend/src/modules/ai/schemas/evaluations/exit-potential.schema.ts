import { z } from "zod";
import { BaseEvaluationSchema } from "../base-evaluation.schema";

const requiredStringFromNull = (fallback: string) =>
  z.preprocess(
    (value) => (value === null ? fallback : value),
    z.string().min(1),
  );

export const ExitPotentialEvaluationSchema = BaseEvaluationSchema.extend({
  exitScenarios: z.array(z.string()).default([]),
  acquirers: z.array(z.string()).default([]),
  exitTimeline: requiredStringFromNull("Exit timeline requires manual review"),
  returnPotential: requiredStringFromNull("Return potential requires manual review"),
});

export type ExitPotentialEvaluation = z.infer<
  typeof ExitPotentialEvaluationSchema
>;
