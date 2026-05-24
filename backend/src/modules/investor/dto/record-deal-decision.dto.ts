import { createZodDto } from "nestjs-zod";
import { z } from "zod";

/**
 * DS-E11-F1-S1 — 30-second close/pass capture body.
 *
 * `reasonTags` is intentionally a free-form string array (not an enum) so
 * the picker can grow without a migration. The service validates that
 * tags are short and reasonable. Notes are optional but capped — the
 * intent is "30-second capture", not a memo.
 *
 * `primaryDriverLens` (optional) names the single lens the investor felt
 * was the deciding factor — Team / Market / Traction. The service folds
 * it into `reasonTags` as `primary_driver:<lens>` so the calibration loop
 * keys on it without a separate column.
 *
 * `notes` doubles as the story's "1-line rationale".
 */
export const PrimaryDriverLensSchema = z.enum(["team", "market", "traction"]);
export type PrimaryDriverLens = z.infer<typeof PrimaryDriverLensSchema>;

export const RecordDealDecisionSchema = z.object({
  verdict: z.enum(["advance", "pass", "hold"]),
  reasonTags: z
    .array(z.string().min(1).max(40))
    .max(8)
    .optional()
    .default([]),
  notes: z.string().max(500).optional(),
  primaryDriverLens: PrimaryDriverLensSchema.optional(),
});

export type RecordDealDecision = z.infer<typeof RecordDealDecisionSchema>;
export class RecordDealDecisionDto extends createZodDto(
  RecordDealDecisionSchema,
) {}
