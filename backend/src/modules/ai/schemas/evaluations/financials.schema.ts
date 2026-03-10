import { z } from "zod";
import { SimpleEvaluationWithRecsSchema } from "../simple-evaluation.schema";

export const FinancialsEvaluationSchema = SimpleEvaluationWithRecsSchema;

export type FinancialsEvaluation = z.infer<typeof FinancialsEvaluationSchema>;
