import { z } from "zod";
import { LENS_EVIDENCE_SOURCE_TYPES } from "./evidence-link";

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
    claim: z.string(),
    source: z.string(),
    confidence: LensConfidenceSchema,
    sourceType: LensEvidenceSourceTypeSchema.nullable(),
    sourceLabel: z.string().nullable(),
    sourceRef: z.string().nullable(),
    url: z.string().nullable(),
    pageNumber: z.number().int().nullable(),
    quote: z.string().nullable(),
  });
export type LensEvidenceItem = z.infer<typeof LensEvidenceSchema>;

export const LensOutputSchema = z.object({
  score: z.number().int(),
  signal: LensSignalSchema,
  rationale: z.string(),
  evidence: z.array(LensEvidenceSchema),
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
   * Pre-formatted investor thesis text. Market/team/traction lenses do NOT
   * use this — they evaluate purely on startup quality. Kept in the schema
   * for other lens types that may need it (e.g. thesis-fit lens).
   */
  investorThesis: z.string().optional().default(""),
  /**
   * Pre-formatted team roster (one bullet per member: name / role /
   * LinkedIn). Consumed by the Team lens only; other lenses receive the
   * variable but typically ignore it.
   */
  teamMembers: z.string().optional().default(""),
  /**
   * DS-E2-F1-S3 — scoped document content blocks. Pre-formatted markdown
   * sections produced by `LensContentRouterService` per lens so each lens
   * only sees the upstream-cached content it actually needs. Empty string
   * when no content of that kind is available (the prompt template uses
   * the variable verbatim, so empty produces an empty section).
   */
  /** Per-lens slice of `extractionResult.deckStructuredData` formatted as bullets with `(deck p.N)` page citations. */
  deckSectionsBlock: z.string().optional().default(""),
  /** Capped excerpt of `extractionResult.rawText` — primary fallback for sections the LLM didn't extract structurally. */
  deckExcerptBlock: z.string().optional().default(""),
  /** Per-lens slice of `EnrichmentResult` (e.g. tractionSignals for traction lens, fundingHistory for market lens). */
  enrichmentBlock: z.string().optional().default(""),
  /** Per-lens slice of `ScrapingResult` (pricing/customers for traction, website summary for market, team bios for team). */
  scrapedBlock: z.string().optional().default(""),
  /** Per-lens slice of cached supporting-doc text (financials docs for traction, team_hr for team, etc.). */
  supportingDocsBlock: z.string().optional().default(""),
  /** Detailed LinkedIn profiles (experience + education) for each team member — consumed by the team lens only. */
  teamProfilesBlock: z.string().optional().default(""),
});
export type LensInput = z.infer<typeof LensInputSchema>;
