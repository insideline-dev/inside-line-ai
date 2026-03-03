import { z } from "zod";
import { SimpleEvaluationWithRecsSchema } from "../simple-evaluation.schema";

export const BusinessModelEvaluationSchema = SimpleEvaluationWithRecsSchema;

export type BusinessModelEvaluation = z.infer<
  typeof BusinessModelEvaluationSchema
>;
