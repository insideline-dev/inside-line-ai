import { z } from "zod";
import type { MissingMaterialCode } from "./missing-materials";
import {
  ScreeningNextActionSchema,
  ScreeningSignalSchema,
} from "./screening-outcome";

/**
 * v1 of the public ScreeningOutput contract consumed by Due Diligence.
 *
 * IMPORTANT: This file does NOT import from `modules/ai/lenses/` or
 * `modules/ai/schemas/lens/`. The whole point of this contract is to decouple
 * DD from Screening internals — DD must depend on this Zod schema only. When
 * the lens internals evolve, the contract is bumped to v2 in a sibling file
 * and v1 stays untouched so older callers keep working.
 */

export type ScreeningSignal = z.infer<typeof ScreeningSignalSchema>;
export type ScreeningNextAction = z.infer<typeof ScreeningNextActionSchema>;

export const ScreeningEvidenceConfidenceSchema = z.enum([
  "low",
  "medium",
  "high",
]);
export type ScreeningEvidenceConfidence = z.infer<
  typeof ScreeningEvidenceConfidenceSchema
>;

export const ScreeningEvidenceSourceTypeSchema = z.enum([
  "deck_page",
  "public_url",
  "enrichment_call",
  "research_source",
  "internal_trace",
]);
export type ScreeningEvidenceSourceType = z.infer<
  typeof ScreeningEvidenceSourceTypeSchema
>;

export const ScreeningEvidenceSchema = z.object({
  claim: z.string().min(1),
  source: z.string().optional(),
  confidence: ScreeningEvidenceConfidenceSchema,
  sourceType: ScreeningEvidenceSourceTypeSchema.optional(),
  sourceLabel: z.string().min(1).optional(),
  sourceRef: z.string().min(1).optional(),
  url: z.url().optional(),
  pageNumber: z.number().int().min(1).optional(),
  quote: z.string().min(1).optional(),
});
export type ScreeningEvidence = z.infer<typeof ScreeningEvidenceSchema>;

export const ScreeningHandoffEvidenceSchema = z.object({
  lensKey: z.string().min(1),
  lensLabel: z.string().min(1),
  claim: z.string().min(1),
  source: z.string().optional(),
  confidence: ScreeningEvidenceConfidenceSchema,
  sourceType: ScreeningEvidenceSourceTypeSchema.optional(),
  sourceLabel: z.string().min(1).optional(),
  sourceRef: z.string().min(1).optional(),
  url: z.url().optional(),
  pageNumber: z.number().int().min(1).optional(),
  quote: z.string().min(1).optional(),
  lensScore: z.number().int().min(0).max(100),
  signal: ScreeningSignalSchema,
});
export type ScreeningHandoffEvidence = z.infer<
  typeof ScreeningHandoffEvidenceSchema
>;

export const ScreeningHandoffIssueSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  summary: z.string().min(1),
  source: z.enum(["screening-output", "triage-decision"]),
});
export type ScreeningHandoffIssue = z.infer<typeof ScreeningHandoffIssueSchema>;

export const ScreeningHandoffSchema = z.object({
  evidenceSeeds: z.array(ScreeningHandoffEvidenceSchema),
  openIssues: z.array(ScreeningHandoffIssueSchema),
});
export type ScreeningHandoff = z.infer<typeof ScreeningHandoffSchema>;

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
  nextAction: ScreeningNextActionSchema,
  /**
   * Hold-list populated by DS-E7-F4 (missing-materials gate). v1 always
   * defaults to []; the contract is stable so the gate can fill this without
   * a schema bump.
   */
  missingMaterials: z.array(z.string()),
});
export type ScreeningOverallV1 = Omit<
  z.infer<typeof ScreeningOverallV1Schema>,
  "missingMaterials"
> & {
  missingMaterials: MissingMaterialCode[];
};

export const ScreeningOutputV1Schema = z.object({
  version: z.literal(1),
  startupId: z.string().uuid(),
  pipelineRunId: z.string().nullable(),
  generatedAt: z.string().datetime(),
  overall: ScreeningOverallV1Schema,
  handoff: ScreeningHandoffSchema,
  lenses: z.array(ScreeningLensV1Schema),
});
export type ScreeningOutputV1 = z.infer<typeof ScreeningOutputV1Schema>;
