import { z } from "zod";

const nullToUndefined = (value: unknown): unknown =>
  value === null ? undefined : value;

const nullToFallbackString = (fallback: string) => (value: unknown): unknown =>
  value === null ? fallback : value;

const stringArray = z.preprocess(
  (value) =>
    Array.isArray(value)
      ? value.filter((item): item is string => typeof item === "string")
      : [],
  z.array(z.string()),
).default([]);

const optionalNarrative = z.preprocess(
  nullToUndefined,
  z.string().min(1).optional(),
);

export const BaseEvaluationSchema = z.object({
  score: z.number().int().min(0).max(100),
  confidence: z.number().min(0).max(1),
  feedback: z.preprocess(
    nullToFallbackString("Automated assessment pending manual review."),
    z.string().min(1),
  ),
  narrativeSummary: optionalNarrative,
  memoNarrative: optionalNarrative,
  keyFindings: stringArray,
  risks: stringArray,
  dataGaps: stringArray,
  sources: stringArray,
});

export type BaseEvaluation = z.infer<typeof BaseEvaluationSchema>;
