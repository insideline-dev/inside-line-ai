import { z } from "zod";
import {
  LENS_EVIDENCE_SOURCE_TYPES,
  normalizeLensEvidenceLink,
} from "./evidence-link";

/**
 * Shared schema produced by every screening lens. Per-lens schemas extend this
 * only when they need lens-specific evidence shape; otherwise they re-export.
 *
 * Mirrors `LensEvidence` in `entities/lens-result.schema.ts` — keep both in sync.
 */
export const LensSignalSchema = z.enum(["advance", "review", "reject"]);
export type LensSignal = z.infer<typeof LensSignalSchema>;

export const LensConfidenceSchema = z.enum(["low", "medium", "high"]);
export type LensConfidence = z.infer<typeof LensConfidenceSchema>;

export const LensEvidenceSourceTypeSchema = z.enum(LENS_EVIDENCE_SOURCE_TYPES);

export const LensEvidenceSchema = z
  .object({
    claim: z.string().min(1),
    source: z.string().min(1),
    confidence: LensConfidenceSchema,
    sourceType: LensEvidenceSourceTypeSchema.nullable().optional(),
    sourceLabel: z.string().min(1).nullable().optional(),
    sourceRef: z.string().min(1).nullable().optional(),
    url: z.url().nullable().optional(),
    pageNumber: z.number().int().min(1).nullable().optional(),
    quote: z.string().min(1).nullable().optional(),
  })
  .superRefine((value, ctx) => {
    try {
      const normalized = normalizeLensEvidenceLink(value.source);
      if (value.sourceType && value.sourceType !== normalized.sourceType) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["sourceType"],
          message: `sourceType must match normalized source type ${normalized.sourceType}`,
        });
      }
      if (value.pageNumber !== undefined && normalized.pageNumber !== value.pageNumber) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["pageNumber"],
          message: "pageNumber must match the cited deck page",
        });
      }
      if (value.url !== undefined && normalized.url !== value.url) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["url"],
          message: "url must match the cited public URL",
        });
      }
    } catch (error) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["source"],
        message: error instanceof Error ? error.message : "Invalid evidence source",
      });
    }
  });
export type LensEvidenceItem = z.infer<typeof LensEvidenceSchema>;

export const LensOutputSchema = z.object({
  score: z.number().int().min(0).max(100),
  signal: LensSignalSchema,
  rationale: z.string().min(1).max(800),
  evidence: z.array(LensEvidenceSchema).max(5),
});
export type LensOutput = z.infer<typeof LensOutputSchema>;

/** Minimum context required to render a lens prompt and call the LLM. */
export const LensInputSchema = z.object({
  startupId: z.string().min(1),
  startupName: z.string().min(1),
  startupDescription: z.string().optional().default(""),
  sector: z.string().optional().default(""),
  stage: z.string().optional().default(""),
  contextNotes: z.string().optional().default(""),
  /**
   * Pre-formatted investor thesis text (one bullet per criterion). v2 lens
   * prompts make this a required input — without thesis the lens cannot
   * answer "is this worth THIS investor's time?". Empty string when no
   * thesis is on file; the prompt is calibrated to handle that case.
   */
  investorThesis: z.string().optional().default(""),
  /**
   * Pre-formatted team roster (one bullet per member: name / role /
   * LinkedIn). Consumed by the Team lens only; other lenses receive the
   * variable but typically ignore it.
   */
  teamMembers: z.string().optional().default(""),
});
export type LensInput = z.infer<typeof LensInputSchema>;
