import { z } from "zod";

const MemoSectionSchema = z.object({
  title: z.string(),
  content: z.string(),
  highlights: z.array(z.string()).optional(),
  concerns: z.array(z.string()).optional(),
});

const InvestorMemoSchema = z.object({
  executiveSummary: z.string(),
  summary: z.string().optional(),
  sections: z.array(MemoSectionSchema).default([]),
  recommendation: z.string(),
  riskLevel: z.enum(["low", "medium", "high"]),
  dealHighlights: z.array(z.string()).default([]),
  keyDueDiligenceAreas: z.array(z.string()).default([]),
});

const FounderReportSchema = z.object({
  summary: z.string(),
  sections: z.array(MemoSectionSchema).default([]),
  actionItems: z.array(z.string()).default([]),
});

export const SynthesisSectionRewriteSchema = z.object({
  sectionKey: z.string().min(1),
  title: z.string().min(1),
  memoNarrative: z.string().min(1),
  highlights: z.array(z.string()).default([]),
  concerns: z.array(z.string()).default([]),
  diligenceItems: z.array(z.string()).default([]),
});

export const SynthesisSchema = z.object({
  overallScore: z.number().min(0).max(100),
  recommendation: z.enum(["Pass", "Consider", "Decline"]),
  executiveSummary: z.string().min(1),
  strengths: z.array(z.string()).min(1),
  concerns: z.array(z.string()).min(1),
  investmentThesis: z.string().min(1),
  nextSteps: z.array(z.string()),
  confidenceLevel: z.enum(["High", "Medium", "Low"]),
  percentileRank: z.number().min(0).max(100).optional(),
  investorMemo: InvestorMemoSchema,
  founderReport: FounderReportSchema,
  dataConfidenceNotes: z.string().min(1),
});

export const SynthesisFinalCombineSchema = SynthesisSchema;

export type Synthesis = z.infer<typeof SynthesisSchema>;
export type InvestorMemo = z.infer<typeof InvestorMemoSchema>;
export type FounderReport = z.infer<typeof FounderReportSchema>;
export type SynthesisSectionRewrite = z.infer<typeof SynthesisSectionRewriteSchema>;
