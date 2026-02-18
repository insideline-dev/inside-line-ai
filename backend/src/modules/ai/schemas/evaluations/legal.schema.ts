import { z } from "zod";
import { BaseEvaluationSchema } from "../base-evaluation.schema";

const requiredStringFromNull = (fallback: string) =>
  z.preprocess(
    (value) => (value === null ? fallback : value),
    z.string().min(1),
  );

const stringArray = z.preprocess(
  (value) =>
    Array.isArray(value)
      ? value.filter((item): item is string => typeof item === "string")
      : [],
  z.array(z.string()),
).default([]);

export const LegalEvaluationSchema = BaseEvaluationSchema.extend({
  ipStatus: requiredStringFromNull("IP status requires manual review"),
  regulatoryRisks: stringArray,
  legalStructure: requiredStringFromNull("Legal structure requires manual review"),
});

export type LegalEvaluation = z.infer<typeof LegalEvaluationSchema>;
