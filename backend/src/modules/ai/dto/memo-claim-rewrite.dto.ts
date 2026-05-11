import { createZodDto } from "nestjs-zod";
import { z } from "zod";

import { MEMO_SECTION_ORDER } from "../agents/synthesis/synthesis-chunk.config";

const MEMO_SECTION_KEYS = MEMO_SECTION_ORDER.map((s) => s.key) as [
  string,
  ...string[],
];

/**
 * Request body for `POST /startups/:startupId/memo/claims/rewrite` (DG-E1-F3-S1).
 *
 * `originalText` is the verbatim operator-selected claim. `sectionKey`
 * routes the rewrite to the right memo section (used for prompt context
 * and persistence on accept). `sourceIds` carries the cited source labels
 * (or urls) so the rewrite stays constrained to existing evidence.
 *
 * The endpoint never persists. The caller's accept-flow calls
 * `apply-rewrite` separately.
 */
export const RewriteClaimRequestSchema = z.object({
  sectionKey: z.enum(MEMO_SECTION_KEYS),
  originalText: z.string().trim().min(1, "originalText is required"),
  instruction: z.string().trim().max(500).optional(),
  /**
   * Source identifiers carried by the original claim. We accept either the
   * source `label` or `url` here — the rewrite endpoint uses these only to
   * compose the prompt; the persistence side is responsible for keeping the
   * actual source array intact when the rewrite is accepted.
   */
  sourceIds: z.array(z.string().trim().min(1)).optional(),
});
export type RewriteClaimRequest = z.infer<typeof RewriteClaimRequestSchema>;
export class RewriteClaimRequestDto extends createZodDto(
  RewriteClaimRequestSchema,
) {}

const RewriteCandidateSchema = z.object({
  text: z.string().min(1),
  /**
   * `diff` is a best-effort marker that the rewrite differs from the
   * original (server returns the original alongside so the frontend can
   * compute the visual diff cheaply). We deliberately keep this minimal —
   * either an empty string or a short summary, never a structured patch.
   */
  diff: z.string(),
});

export const RewriteClaimResponseSchema = z.object({
  startupId: z.string(),
  sectionKey: z.string(),
  originalText: z.string(),
  /** Up to 3 surviving rewrites (post-filter). May be 0 if every candidate failed the factual-marker guard. */
  rewrites: z.array(RewriteCandidateSchema).max(3),
  /**
   * Total rewrites returned by the model before the source-preservation
   * guard ran. Useful for telemetry; helps callers distinguish "model
   * returned nothing" from "model returned candidates but all violated the
   * factual-marker guard".
   */
  candidateCountBeforeFilter: z.number().int().min(0),
  usedFallback: z.boolean(),
});
export type RewriteClaimResponse = z.infer<typeof RewriteClaimResponseSchema>;
export class RewriteClaimResponseDto extends createZodDto(
  RewriteClaimResponseSchema,
) {}

const MemoSectionSourceSchema = z.object({
  label: z.string().min(1),
  url: z.string().min(1),
});

/**
 * Request body for `POST /startups/:startupId/memo/sections/:sectionKey/apply-rewrite`
 * (DG-E1-F3-S1). Routes the operator-accepted rewrite back through the
 * same persistence path used by section regeneration (`mergeSection`),
 * but skips the model call. Citation linkage is preserved by carrying the
 * original section's sources forward unless the caller passes a
 * substitution.
 */
export const ApplyRewriteRequestSchema = z.object({
  /** Full new narrative for the section. Treated verbatim — no AI call. */
  newContent: z.string().trim().min(1, "newContent is required"),
  /**
   * Optional override for the section sources. When omitted, the existing
   * section sources are preserved unchanged. Passing an empty array is a
   * deliberate "strip all sources" signal.
   */
  sources: z.array(MemoSectionSourceSchema).optional(),
});
export type ApplyRewriteRequest = z.infer<typeof ApplyRewriteRequestSchema>;
export class ApplyRewriteRequestDto extends createZodDto(
  ApplyRewriteRequestSchema,
) {}

/**
 * Response from `apply-rewrite`. Mirrors the regenerate-section response
 * so the frontend hook can share the cache-invalidation pattern.
 */
export const ApplyRewriteResponseSchema = z.object({
  startupId: z.string(),
  sectionKey: z.string(),
  regeneratedAt: z.string(),
  overwroteOperatorEdits: z.boolean(),
  section: z.object({
    sectionKey: z.string(),
    title: z.string(),
    content: z.string(),
    highlights: z.array(z.string()),
    concerns: z.array(z.string()),
    sources: z.array(MemoSectionSourceSchema),
    regeneratedAt: z.string(),
  }),
});
export type ApplyRewriteResponse = z.infer<typeof ApplyRewriteResponseSchema>;
export class ApplyRewriteResponseDto extends createZodDto(
  ApplyRewriteResponseSchema,
) {}
