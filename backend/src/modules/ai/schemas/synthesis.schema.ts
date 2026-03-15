import { z } from "zod";
import { ExitScenarioSchema } from "./evaluations/exit-potential.schema";

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

const MemoSectionSourceSchema = z.object({
  label: requiredString("Unknown source"),
  url: requiredString("deck://"),
});

const MemoSectionSchema = z.object({
  title: requiredString("Untitled section"),
  content: requiredString("Narrative unavailable."),
  highlights: stringArrayWithFallback,
  concerns: stringArrayWithFallback,
  sources: z.preprocess(
    (value) => (Array.isArray(value) ? value : []),
    z.array(MemoSectionSourceSchema),
  ),
});

const InvestorMemoSchema = z.object({
  executiveSummary: requiredString("Investor memo summary unavailable."),
  sections: z.preprocess(
    (value) => (Array.isArray(value) ? value : []),
    z.array(MemoSectionSchema),
  ),
  keyDueDiligenceAreas: stringArrayWithFallback,
});

const FounderReportSchema = z.object({
  summary: requiredString("Founder report summary unavailable."),
  whatsWorking: stringArrayWithFallback,
  pathToInevitability: stringArrayWithFallback,
});

export const SynthesisSectionRewriteSchema = z.object({
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

export const SynthesisSchema = z.object({
  dealSnapshot: requiredString("Deal snapshot unavailable."),
  keyStrengths: z.array(z.string()).min(1),
  keyRisks: z.array(z.string()).min(1),
  investorMemo: InvestorMemoSchema,
  founderReport: FounderReportSchema,
  dataConfidenceNotes: requiredString("Confidence notes unavailable."),
});

export const SynthesisFinalCombineSchema = SynthesisSchema.extend({
  exitScenarios: z.preprocess(
    (value) => (Array.isArray(value) ? value : []),
    z.array(ExitScenarioSchema),
  ),
});

export type Synthesis = z.infer<typeof SynthesisSchema>;
export type InvestorMemo = z.infer<typeof InvestorMemoSchema>;
export type FounderReport = z.infer<typeof FounderReportSchema>;
export type MemoSectionSource = z.infer<typeof MemoSectionSourceSchema>;
export type SynthesisSectionRewrite = z.infer<typeof SynthesisSectionRewriteSchema>;
// ExitScenario type is exported from ./evaluations/exit-potential.schema via the schemas barrel
