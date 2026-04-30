import { createZodDto } from "nestjs-zod";
import { z } from "zod";

/**
 * DS-E11-F1-S1 — 30-second close/pass capture body.
 *
 * `reasonTags` is intentionally a free-form string array (not an enum) so
 * the picker can grow without a migration. The service validates that
 * tags are short and reasonable. Notes are optional but capped — the
 * intent is "30-second capture", not a memo.
 */
export const RecordDealDecisionSchema = z.object({
  verdict: z.enum(["advance", "pass", "hold"]),
  reasonTags: z
    .array(z.string().min(1).max(40))
    .max(8)
    .optional()
    .default([]),
  notes: z.string().max(500).optional(),
  /**
   * Optional client-supplied snapshot of the system's triage classification
   * at the moment the investor recorded their decision. The calibration
   * loop will later use this to compare model-verdict vs investor-verdict
   * without re-querying historical screening rows.
   */
  triageClassificationAtDecision: z
    .enum(["advance", "review", "reject"])
    .optional(),
});

export type RecordDealDecision = z.infer<typeof RecordDealDecisionSchema>;
export class RecordDealDecisionDto extends createZodDto(
  RecordDealDecisionSchema,
) {}
