import { z } from "zod";
import { ExitScenarioSchema } from "./evaluations/exit-potential.schema";

const MemoSectionSourceSchema = z.object({
  label: z.string(),
  url: z.string(),
});

const MemoSectionSchema = z.object({
  title: z.string(),
  content: z.string(),
  highlights: z.array(z.string()).optional(),
  concerns: z.array(z.string()).optional(),
  sources: z.array(MemoSectionSourceSchema).optional(),
});

const InvestorMemoSchema = z.object({
  executiveSummary: z.string(),
  sections: z.array(MemoSectionSchema).default([]),
  keyDueDiligenceAreas: z.array(z.string()).default([]),
});

const FounderReportSchema = z.object({
  summary: z.string(),
  whatsWorking: z.array(z.string()).default([]),
  pathToInevitability: z.array(z.string()).default([]),
});

export const SynthesisSectionRewriteSchema = z.object({
  sectionKey: z.string().min(1),
  title: z.string().min(1),
  memoNarrative: z.string().min(1),
  highlights: z.array(z.string()).default([]),
  concerns: z.array(z.string()).default([]),
  diligenceItems: z.array(z.string()).default([]),
  sources: z.array(MemoSectionSourceSchema).default([]),
});

export const SynthesisSchema = z.object({
  dealSnapshot: z.string().min(1),
  keyStrengths: z.array(z.string()).min(1),
  keyRisks: z.array(z.string()).min(1),
  investorMemo: InvestorMemoSchema,
  founderReport: FounderReportSchema,
  dataConfidenceNotes: z.string().min(1),
});

export const SynthesisFinalCombineSchema = SynthesisSchema.extend({
  exitScenarios: z.array(ExitScenarioSchema).default([]),
});

export type Synthesis = z.infer<typeof SynthesisSchema>;
export type InvestorMemo = z.infer<typeof InvestorMemoSchema>;
export type FounderReport = z.infer<typeof FounderReportSchema>;
export type MemoSectionSource = z.infer<typeof MemoSectionSourceSchema>;
export type SynthesisSectionRewrite = z.infer<typeof SynthesisSectionRewriteSchema>;
// ExitScenario type is exported from ./evaluations/exit-potential.schema via the schemas barrel
