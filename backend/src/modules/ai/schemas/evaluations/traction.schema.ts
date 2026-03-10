import { z } from "zod";
import { SimpleEvaluationSchema } from "../simple-evaluation.schema";

export const TractionEvaluationSchema = SimpleEvaluationSchema;

export type TractionEvaluation = z.infer<typeof TractionEvaluationSchema>;
