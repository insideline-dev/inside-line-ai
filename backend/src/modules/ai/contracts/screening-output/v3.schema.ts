import { z } from "zod";
import {
  ScreeningHandoffSchema,
  ScreeningLensV1Schema,
  ScreeningOverallV1Schema,
} from "./v1.schema";
import { ScreeningLensScoreV2Schema } from "./v2.schema";
import { ThesisFitOutputSchema } from "../../schemas/thesis-fit.schema";

/**
 * Screening output v3 — closes the remaining DS-E10-F1 typed-contract gaps.
 *
 * v1 → screening_lens_scores, evidence seeds, open issues, verdict.
 * v2 → thesisFit, lensScores roll-up.
 * v3 → dealbreakersObserved[], top-level reasoning, overall confidence.
 *
 * Compatibility: v3 is a strict superset of v2 — every v2 field is present
 * unchanged, plus three additions DD has been deriving by parsing reason
 * codes on its own. Pulling them up to the contract is the difference
 * between "DD knows about Screening internals" and "DD reads a stable shape".
 *
 *  - `dealbreakersObserved`: typed list of what tripped during triage.
 *    `kind` discriminates the four sources that emit reject signals today:
 *      `boundary` (DS-E4-F1 out_of_stage/scope/geo),
 *      `portfolio` (DS-E4-F2 portfolio_conflict),
 *      `tag` (DS-E4-F4 dealbreaker:<term>),
 *      `structured` (DS-E4-F3 dealbreaker:structured:<rule-id>:<action>).
 *  - `reasoning`: short human-readable narrative that summarises the
 *    verdict. Derived from per-lens rationales + the strongest reason
 *    codes. Capped so it fits on the 1-page PDF (DS-E10-F4).
 *  - `confidence`: Low/Med/High roll-up of evidence quality across the
 *    three lenses. Derived from the same weighted-confidence metric the
 *    triage policy uses for the F7-F2 evidence gate.
 */

export const ScreeningDealbreakerKindSchema = z.enum([
  "boundary",
  "portfolio",
  "tag",
  "structured",
]);
export type ScreeningDealbreakerKind = z.infer<
  typeof ScreeningDealbreakerKindSchema
>;

export const ScreeningOverallConfidenceSchema = z.enum(["low", "medium", "high"]);
export type ScreeningOverallConfidence = z.infer<
  typeof ScreeningOverallConfidenceSchema
>;

export const ScreeningDealbreakerObservationSchema = z.object({
  /** Raw reason code, e.g. `out_of_geo`, `portfolio_conflict:Acme`. */
  code: z.string().min(1),
  kind: ScreeningDealbreakerKindSchema,
  /** Short user-facing label (already humanised). */
  label: z.string().min(1),
  /**
   * For `structured` rules: the rule id. For `portfolio`: the conflicting
   * portfolio company name. For `tag`: the matched term. For `boundary`:
   * the axis (stage / scope / geo). Optional because some codes don't
   * carry a discriminator.
   */
  ref: z.string().nullable().default(null),
  /**
   * Story (DS-E4 parent epic) names every dealbreaker as REJECT. F4-F3
   * introduced a soft tier (`require_override`) that downgrades to
   * REVIEW. Surfaced here so DD can distinguish "killed it" from
   * "needs a partner gate".
   */
  action: z.enum(["reject", "require_override"]),
});
export type ScreeningDealbreakerObservation = z.infer<
  typeof ScreeningDealbreakerObservationSchema
>;

export const ScreeningOutputV3Schema = z.object({
  version: z.literal(3),
  startupId: z.string().uuid(),
  pipelineRunId: z.string().nullable(),
  generatedAt: z.string().datetime(),
  overall: ScreeningOverallV1Schema,
  handoff: ScreeningHandoffSchema,
  lenses: z.array(ScreeningLensV1Schema),
  thesisFit: ThesisFitOutputSchema.nullable(),
  lensScores: z.array(ScreeningLensScoreV2Schema),
  // DS-E10-F1 additions:
  dealbreakersObserved: z.array(ScreeningDealbreakerObservationSchema),
  reasoning: z.string().max(1200),
  confidence: ScreeningOverallConfidenceSchema,
});
export type ScreeningOutputV3 = z.infer<typeof ScreeningOutputV3Schema>;
