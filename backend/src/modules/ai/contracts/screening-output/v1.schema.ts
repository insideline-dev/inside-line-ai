import { z } from "zod";

/**
 * v1 of the public ScreeningOutput contract consumed by Due Diligence.
 *
 * IMPORTANT: This file does NOT import from `modules/ai/lenses/` or
 * `modules/ai/schemas/lens/`. The whole point of this contract is to decouple
 * DD from Screening internals — DD must depend on this Zod schema only. When
 * the lens internals evolve, the contract is bumped to v2 in a sibling file
 * and v1 stays untouched so older callers keep working.
 */

export const ScreeningSignalSchema = z.enum(["advance", "review", "reject"]);
export type ScreeningSignal = z.infer<typeof ScreeningSignalSchema>;

export const ScreeningEvidenceConfidenceSchema = z.enum([
  "low",
  "medium",
  "high",
]);
export type ScreeningEvidenceConfidence = z.infer<
  typeof ScreeningEvidenceConfidenceSchema
>;

export const ScreeningEvidenceSchema = z.object({
  claim: z.string().min(1),
  source: z.string().optional(),
  confidence: ScreeningEvidenceConfidenceSchema,
});
export type ScreeningEvidence = z.infer<typeof ScreeningEvidenceSchema>;

export const ScreeningLensV1Schema = z.object({
  key: z.string().min(1),
  score: z.number().int().min(0).max(100),
  signal: ScreeningSignalSchema,
  rationale: z.string(),
  evidence: z.array(ScreeningEvidenceSchema),
  modelId: z.string(),
  promptKey: z.string(),
  latencyMs: z.number().int().min(0),
  usedFallback: z.boolean(),
});
export type ScreeningLensV1 = z.infer<typeof ScreeningLensV1Schema>;

export const ScreeningOverallV1Schema = z.object({
  score: z.number().int().min(0).max(100),
  signal: ScreeningSignalSchema,
  /**
   * Hold-list populated by DS-E7-F4 (missing-materials gate). v1 always
   * defaults to []; the contract is stable so the gate can fill this without
   * a schema bump.
   */
  missingMaterials: z.array(z.string()),
});
export type ScreeningOverallV1 = z.infer<typeof ScreeningOverallV1Schema>;

export const ScreeningOutputV1Schema = z.object({
  version: z.literal(1),
  startupId: z.string().uuid(),
  pipelineRunId: z.string().nullable(),
  generatedAt: z.string().datetime(),
  overall: ScreeningOverallV1Schema,
  lenses: z.array(ScreeningLensV1Schema),
});
export type ScreeningOutputV1 = z.infer<typeof ScreeningOutputV1Schema>;
