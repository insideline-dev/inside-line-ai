import { z } from "zod";
import {
  ScreeningHandoffSchema,
  ScreeningLensV1Schema,
  ScreeningOverallV1Schema,
} from "./v1.schema";
import { ThesisFitOutputSchema } from "../../schemas/thesis-fit.schema";

/**
 * Screening output v2 — adds thesis-fit (per-axis) and structured lens score
 * roll-up to v1. v1 stays frozen as the historical contract; v2 is the
 * forward-looking handoff into DD.
 *
 * Per the architectural plan §10 (PR4): "bump to ScreeningOutputV2. New file
 * backend/src/modules/ai/contracts/screening-output/v2.schema.ts adds
 * thesisFit (per-axis structured object) and lensScores (market/team/traction)."
 *
 * Compatibility: v2 is a strict superset of v1 — every required v1 field is
 * present unchanged, plus two additions:
 *
 *  - `thesisFit`: nullable to support the bootstrap case where no investor
 *    thesis was on file at run time (matches the lazy-backfill semantics on
 *    the screening_decision.thesis_fit jsonb column).
 *  - `lensScores`: condensed score/signal roll-up keyed by lens. Redundant
 *    with `lenses[]` for callers that only need numbers; intentionally kept
 *    on the contract because the UI deserializes from `lensScores` directly.
 */
export const ScreeningLensScoreV2Schema = z.object({
  key: z.enum(["market", "team", "traction"]),
  score: z.number().int().min(0).max(100),
  signal: z.enum(["advance", "review", "reject"]),
  rationale: z.string().optional(),
});
export type ScreeningLensScoreV2 = z.infer<typeof ScreeningLensScoreV2Schema>;

export const ScreeningOutputV2Schema = z.object({
  version: z.literal(2),
  startupId: z.string().uuid(),
  pipelineRunId: z.string().nullable(),
  generatedAt: z.string().datetime(),
  overall: ScreeningOverallV1Schema,
  handoff: ScreeningHandoffSchema,
  lenses: z.array(ScreeningLensV1Schema),
  thesisFit: ThesisFitOutputSchema.nullable(),
  lensScores: z.array(ScreeningLensScoreV2Schema),
});
export type ScreeningOutputV2 = z.infer<typeof ScreeningOutputV2Schema>;
