import { z } from "zod";
import { BaseEvaluationSchema } from "../base-evaluation.schema";

export const LegalEvaluationSchema = BaseEvaluationSchema.extend({
  ipStatus: z.string().min(1),
  regulatoryRisks: z.array(z.string()).default([]),
  legalStructure: z.string().min(1),
});

export type LegalEvaluation = z.infer<typeof LegalEvaluationSchema>;
