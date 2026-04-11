import { z } from "zod";

// OpenAI strict mode: all fields required, no preprocess, no optional fields.
// This mirrors MemoSynthesisOutputSchema shape but without z.preprocess() so
// that `zodResponseFormat()` can emit a strict JSON schema.

const MemoSectionSourceOpenAiSchema = z.object({
  label: z.string(),
  url: z.string(),
});

const MemoChunkSectionOpenAiSchema = z.object({
  sectionKey: z.string(),
  title: z.string(),
  memoNarrative: z.string(),
  highlights: z.array(z.string()),
  concerns: z.array(z.string()),
  diligenceItems: z.array(z.string()),
  sources: z.array(MemoSectionSourceOpenAiSchema),
});

export const MemoSynthesisOutputOpenAiSchema = z.object({
  executiveSummary: z.string(),
  sections: z.array(MemoChunkSectionOpenAiSchema),
  keyDueDiligenceAreas: z.array(z.string()),
  dataConfidenceNotes: z.string(),
});

export type MemoSynthesisOutputOpenAi = z.infer<
  typeof MemoSynthesisOutputOpenAiSchema
>;
