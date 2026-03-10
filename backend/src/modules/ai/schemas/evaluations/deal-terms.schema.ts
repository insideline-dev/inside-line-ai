import { z } from "zod";
import { SimpleEvaluationSchema } from "../simple-evaluation.schema";

export const DealTermsEvaluationSchema = SimpleEvaluationSchema;

export type DealTermsEvaluation = z.infer<typeof DealTermsEvaluationSchema>;
