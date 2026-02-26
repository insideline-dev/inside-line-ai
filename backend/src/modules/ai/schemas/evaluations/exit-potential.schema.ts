import { z } from "zod";
import { BaseEvaluationSchema } from "../base-evaluation.schema";

const requiredStringFromNull = (fallback: string) =>
  z.preprocess(
    (value) => (value == null ? fallback : value),
    z.string().min(1),
  );

const stringArray = z.preprocess(
  (value) =>
    Array.isArray(value)
      ? value.filter((item): item is string => typeof item === "string")
      : [],
  z.array(z.string()),
).default([]);

export const ExitPotentialEvaluationSchema = BaseEvaluationSchema.extend({
  exitScenarios: stringArray,
  acquirers: stringArray,
  exitTimeline: requiredStringFromNull("Exit timeline requires manual review"),
  returnPotential: requiredStringFromNull("Return potential requires manual review"),
});

export type ExitPotentialEvaluation = z.infer<
  typeof ExitPotentialEvaluationSchema
>;
