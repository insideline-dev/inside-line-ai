import { z } from "zod";
import { SimpleEvaluationWithRecsSchema } from "../simple-evaluation.schema";

export const LegalEvaluationSchema = SimpleEvaluationWithRecsSchema;

export type LegalEvaluation = z.infer<typeof LegalEvaluationSchema>;
