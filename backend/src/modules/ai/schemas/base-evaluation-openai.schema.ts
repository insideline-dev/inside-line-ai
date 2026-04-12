import { z } from "zod";

// OpenAI strict mode: all fields required, no preprocess, no default.
// Mirrors BaseEvaluationSchema shape so output can be re-parsed through the
// standard schema (which applies fallback defaults and normalization).

export const EvaluationConfidenceOpenAiSchema = z.enum(["high", "mid", "low"]);

export const StructuredDataGapOpenAiSchema = z.object({
  gap: z.string(),
  impact: z.enum(["critical", "important", "minor"]),
  suggestedAction: z.string(),
});

export const BaseScoringSubScoreOpenAiSchema = z.object({
  dimension: z.string(),
  weight: z.number(),
  score: z.number().int().min(0).max(100),
});

export const BaseScoringOpenAiSchema = z.object({
  overallScore: z.number().int().min(0).max(100),
  confidence: EvaluationConfidenceOpenAiSchema,
  scoringBasis: z.string(),
  subScores: z.array(BaseScoringSubScoreOpenAiSchema),
});

export const FounderPitchRecommendationOpenAiSchema = z.object({
  deckMissingElement: z.string(),
  whyItMatters: z.string(),
  recommendation: z.string(),
});

export const BaseEvaluationOpenAiSchema = z.object({
  score: z.number().int().min(0).max(100),
  confidence: EvaluationConfidenceOpenAiSchema,
  scoring: BaseScoringOpenAiSchema,
  narrativeSummary: z.string(),
  keyFindings: z.array(z.string()),
  strengths: z.array(z.string()),
  risks: z.array(z.string()),
  dataGaps: z.array(StructuredDataGapOpenAiSchema),
  sources: z.array(z.string()),
  howToStrengthen: z.array(z.string()),
});
