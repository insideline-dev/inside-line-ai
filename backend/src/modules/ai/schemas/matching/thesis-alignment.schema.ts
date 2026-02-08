import { z } from "zod";

export const ThesisMatchSchema = z.object({
  thesisId: z.string().min(1),
  thesisName: z.string().min(1),
  matchScore: z.number().int().min(0).max(100),
  matchingCriteria: z.array(z.string()).default([]),
  gaps: z.array(z.string()).default([]),
});

export const ThesisAlignmentSchema = z.object({
  thesisMatches: z.array(ThesisMatchSchema).default([]),
  alignmentScore: z.number().int().min(0).max(100),
  rationale: z.string().min(1),
});

export type ThesisAlignment = z.infer<typeof ThesisAlignmentSchema>;
