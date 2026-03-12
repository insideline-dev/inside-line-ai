import { z } from "zod";

export const EVALUATION_CONFIDENCE_LEVELS = [
  "high",
  "mid",
  "low",
] as const;

export type EvaluationConfidenceLevel =
  (typeof EVALUATION_CONFIDENCE_LEVELS)[number];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function normalizeConfidenceInput(value: unknown): unknown {
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

function splitListLikeString(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((item) => item.replace(/^[\s\-*•]+/, "").trim())
    .filter((item) => item.length > 0);
}

export function normalizeStringArrayInput(value: unknown): string[] {
  if (typeof value === "string") {
    return splitListLikeString(value);
  }

  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .flatMap((item) => {
      if (typeof item === "string") {
        return splitListLikeString(item);
      }
      return [];
    })
    .filter((item) => item.length > 0);
}

export const EvaluationConfidenceSchema = z.preprocess(
  normalizeConfidenceInput,
  z.enum(EVALUATION_CONFIDENCE_LEVELS),
);

export const stringArray = z.preprocess(
  normalizeStringArrayInput,
  z.array(z.string()),
).default([]);

export const requiredStringFromNull = (fallback: string) =>
  z.preprocess(
    (value) => (value == null ? fallback : value),
    z.string().min(1),
  );

export const StructuredDataGapSchema = z.object({
  gap: requiredStringFromNull("Gap not specified"),
  impact: z.preprocess(
    (value) => {
      if (typeof value !== "string") return "important";
      const normalized = value.trim().toLowerCase();
      if (normalized === "critical") return "critical";
      if (normalized === "minor") return "minor";
      return "important";
    },
    z.enum(["critical", "important", "minor"]),
  ),
  suggestedAction: requiredStringFromNull("Suggested diligence action not provided"),
});

function normalizeStructuredDataGap(value: unknown): z.input<typeof StructuredDataGapSchema> | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    return {
      gap: trimmed,
      impact: "important",
      suggestedAction: "Suggested diligence action not provided",
    };
  }

  if (!isRecord(value)) {
    return null;
  }

  const gap =
    typeof value.gap === "string"
      ? value.gap
      : typeof value.description === "string"
        ? value.description
        : "";
  if (gap.trim().length === 0) {
    return null;
  }

  return {
    gap,
    impact: value.impact,
    suggestedAction:
      typeof value.suggestedAction === "string"
        ? value.suggestedAction
        : typeof value.action === "string"
          ? value.action
          : "Suggested diligence action not provided",
  };
}

export function normalizeStructuredDataGapInput(
  value: unknown,
): Array<z.input<typeof StructuredDataGapSchema>> {
  if (typeof value === "string") {
    return splitListLikeString(value)
      .map((item) => normalizeStructuredDataGap(item))
      .filter((item): item is z.input<typeof StructuredDataGapSchema> => item !== null);
  }

  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => normalizeStructuredDataGap(item))
    .filter((item): item is z.input<typeof StructuredDataGapSchema> => item !== null);
}

export const structuredDataGapArray = z.preprocess(
  normalizeStructuredDataGapInput,
  z.array(StructuredDataGapSchema),
).default([]);

export const BaseScoringSubScoreSchema = z.object({
  dimension: requiredStringFromNull("Dimension not specified"),
  weight: z.preprocess(
    (value) => {
      if (typeof value === "number" && Number.isFinite(value)) return value;
      if (typeof value === "string" && value.trim().length > 0) {
        const parsed = Number(value.trim().replace(/%/g, ""));
        if (Number.isFinite(parsed)) {
          return parsed > 1 ? parsed / 100 : parsed;
        }
      }
      return 0;
    },
    z.number(),
  ),
  score: z.preprocess(
    (value) => {
      if (typeof value === "number" && Number.isFinite(value)) return Math.round(value);
      if (typeof value === "string" && value.trim().length > 0) {
        const parsed = Number(value.trim());
        if (Number.isFinite(parsed)) return Math.round(parsed);
      }
      return 0;
    },
    z.number().int().min(0).max(100),
  ),
});

export const BaseScoringSchema = z.object({
  overallScore: z.preprocess(
    (value) => {
      if (typeof value === "number" && Number.isFinite(value)) return Math.round(value);
      if (typeof value === "string" && value.trim().length > 0) {
        const parsed = Number(value.trim());
        if (Number.isFinite(parsed)) return Math.round(parsed);
      }
      return 50;
    },
    z.number().int().min(0).max(100),
  ),
  confidence: EvaluationConfidenceSchema,
  scoringBasis: requiredStringFromNull("Scoring basis pending"),
  subScores: z.preprocess(
    (value) => (Array.isArray(value) ? value : []),
    z.array(BaseScoringSubScoreSchema),
  ),
});

export function normalizeBaseEvaluationCandidate(candidate: unknown): unknown {
  if (!isRecord(candidate)) {
    return candidate;
  }

  const scoring = isRecord(candidate.scoring) ? candidate.scoring : null;
  const rawScore =
    typeof candidate.score === "number"
      ? candidate.score
      : typeof scoring?.overallScore === "number"
        ? scoring.overallScore
        : candidate.score;
  const rawConfidence = candidate.confidence ?? scoring?.confidence;
  const scoringBasis =
    typeof scoring?.scoringBasis === "string"
      ? scoring.scoringBasis
      : typeof candidate.scoringBasis === "string"
        ? candidate.scoringBasis
        : "Scoring basis pending";
  const keyFindings =
    normalizeStringArrayInput(candidate.keyFindings).length > 0
      ? normalizeStringArrayInput(candidate.keyFindings)
      : normalizeStringArrayInput(candidate.strengths);
  const strengths =
    normalizeStringArrayInput(candidate.strengths).length > 0
      ? normalizeStringArrayInput(candidate.strengths)
      : keyFindings;

  return {
    ...candidate,
    score:
      typeof rawScore === "number" && Number.isFinite(rawScore)
        ? Math.max(0, Math.min(100, Math.round(rawScore)))
        : 50,
    confidence: normalizeConfidenceInput(rawConfidence) ?? "low",
    scoring: {
      ...(scoring ?? {}),
      overallScore:
        typeof rawScore === "number" && Number.isFinite(rawScore)
          ? Math.max(0, Math.min(100, Math.round(rawScore)))
          : 50,
      confidence: normalizeConfidenceInput(rawConfidence) ?? "low",
      scoringBasis,
      subScores: Array.isArray(scoring?.subScores) ? scoring.subScores : [],
    },
    keyFindings,
    strengths,
    risks: normalizeStringArrayInput(candidate.risks),
    dataGaps: normalizeStructuredDataGapInput(candidate.dataGaps),
    sources: normalizeStringArrayInput(candidate.sources),
  };
}

export const BaseEvaluationSchema = z.object({
  score: z.number().int().min(0).max(100),
  confidence: EvaluationConfidenceSchema,
  scoring: z.preprocess(
    (value) =>
      value ?? {
        overallScore: 50,
        confidence: "low",
        scoringBasis: "Scoring basis pending",
        subScores: [],
      },
    BaseScoringSchema,
  ),
  narrativeSummary: z.preprocess(
    (value) => (value == null || value === "" ? "Evaluation pending." : value),
    z.string().min(1),
  ),
  keyFindings: stringArray,
  strengths: stringArray,
  risks: stringArray,
  dataGaps: structuredDataGapArray,
  sources: stringArray,
});

export type BaseEvaluation = z.infer<typeof BaseEvaluationSchema>;
