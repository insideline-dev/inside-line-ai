import { z } from "zod";
import { SimpleEvaluationSchema } from "../simple-evaluation.schema";

export const ExitPotentialEvaluationSchema = SimpleEvaluationSchema;

export type ExitPotentialEvaluation = z.infer<
  typeof ExitPotentialEvaluationSchema
>;
