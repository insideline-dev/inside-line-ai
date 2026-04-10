import { z } from "zod";

// Helper: required string with fallback (same pattern used in synthesis.schema.ts)
const requiredString = (fallback: string) =>
  z.preprocess(
    (value) => {
      if (value == null) return fallback;
      if (typeof value === "string" && value.trim().length === 0) return fallback;
      return value;
    },
    z.string().min(1),
  );

const stringArrayWithFallback = z.preprocess(
  (value) => (Array.isArray(value) ? value : []),
  z.array(z.string()),
);

// Source reference in a memo section
const MemoSectionSourceSchema = z.object({
  label: requiredString("Unknown source"),
  url: requiredString("deck://"),
});

// Single section output from the memo agent
export const MemoChunkSectionSchema = z.object({
  sectionKey: requiredString("unknown"),
  title: requiredString("Untitled section"),
  memoNarrative: requiredString("Narrative unavailable."),
  highlights: stringArrayWithFallback,
  concerns: stringArrayWithFallback,
  diligenceItems: stringArrayWithFallback,
  sources: z.preprocess(
    (value) => (Array.isArray(value) ? value : []),
    z.array(MemoSectionSourceSchema),
  ),
});

// Full output schema for the single-call memo synthesis agent
export const MemoSynthesisOutputSchema = z.object({
  executiveSummary: requiredString("Investor memo summary unavailable."),
  sections: z.array(MemoChunkSectionSchema).min(1),
  keyDueDiligenceAreas: stringArrayWithFallback,
  dataConfidenceNotes: requiredString("Confidence notes unavailable."),
});

// Type exports
export type MemoChunkSection = z.infer<typeof MemoChunkSectionSchema>;
export type MemoSynthesisOutput = z.infer<typeof MemoSynthesisOutputSchema>;
export type MemoSectionSource = z.infer<typeof MemoSectionSourceSchema>;
