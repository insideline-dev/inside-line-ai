import { z } from "zod";

export const EVALUATION_CONFIDENCE_LEVELS = [
  "high",
  "mid",
  "low",
] as const;

export type EvaluationConfidenceLevel =
  (typeof EVALUATION_CONFIDENCE_LEVELS)[number];

function normalizeConfidenceInput(value: unknown): unknown {
  if (typeof value === "number" && Number.isFinite(value)) {
    const normalized = value > 1 ? value / 100 : value;
    if (normalized >= 0.7) return "high";
    if (normalized >= 0.4) return "mid";
    return "low";
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "high") return "high";
    if (normalized === "mid" || normalized === "medium") return "mid";
    if (normalized === "low") return "low";
  }

  return value;
}

export const EvaluationConfidenceSchema = z.preprocess(
  normalizeConfidenceInput,
  z.enum(EVALUATION_CONFIDENCE_LEVELS),
);

export const stringArray = z.preprocess(
  (value) =>
    Array.isArray(value)
      ? value.filter((item): item is string => typeof item === "string")
      : [],
  z.array(z.string()),
).default([]);

export const requiredStringFromNull = (fallback: string) =>
  z.preprocess(
    (value) => (value == null ? fallback : value),
    z.string().min(1),
  );

export const BaseEvaluationSchema = z.object({
  score: z.number().int().min(0).max(100),
  confidence: EvaluationConfidenceSchema,
  narrativeSummary: z.preprocess(
    (value) => (value == null || value === "" ? "Evaluation pending." : value),
    z.string().min(1),
  ),
  keyFindings: stringArray,
  risks: stringArray,
  dataGaps: stringArray,
  sources: stringArray,
});

export type BaseEvaluation = z.infer<typeof BaseEvaluationSchema>;
