import { z } from "zod";
import { SimpleEvaluationWithRecsSchema } from "../simple-evaluation.schema";

export const GtmEvaluationSchema = SimpleEvaluationWithRecsSchema;

export type GtmEvaluation = z.infer<typeof GtmEvaluationSchema>;
