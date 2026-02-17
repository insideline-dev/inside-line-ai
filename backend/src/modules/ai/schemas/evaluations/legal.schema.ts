import { z } from "zod";
import { BaseEvaluationSchema } from "../base-evaluation.schema";

const requiredStringFromNull = (fallback: string) =>
  z.preprocess(
    (value) => (value === null ? fallback : value),
    z.string().min(1),
  );

export const LegalEvaluationSchema = BaseEvaluationSchema.extend({
  ipStatus: requiredStringFromNull("IP status requires manual review"),
  regulatoryRisks: z.array(z.string()).default([]),
  legalStructure: requiredStringFromNull("Legal structure requires manual review"),
});

export type LegalEvaluation = z.infer<typeof LegalEvaluationSchema>;
