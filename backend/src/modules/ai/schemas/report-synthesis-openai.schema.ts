import { z } from "zod";

// OpenAI strict mode: all fields required, no preprocess, no optional fields.
// This mirrors ReportSynthesisSchema shape for zodResponseFormat compatibility.

const ExitScenarioOpenAiSchema = z.object({
  scenario: z.string(),
  exitType: z.string(),
  exitValuation: z.string(),
  timeline: z.string(),
  moic: z.number(),
  irr: z.number(),
  researchBasis: z.string(),
});

const FounderReportOpenAiSchema = z.object({
  summary: z.string(),
  whatsWorking: z.array(z.string()),
  pathToInevitability: z.array(z.string()),
});

export const ReportSynthesisOutputOpenAiSchema = z.object({
  dealSnapshot: z.string(),
  keyStrengths: z.array(z.string()),
  keyRisks: z.array(z.string()),
  exitScenarios: z.array(ExitScenarioOpenAiSchema),
  founderReport: FounderReportOpenAiSchema,
  dataConfidenceNotes: z.string(),
});

export type ReportSynthesisOutputOpenAi = z.infer<
  typeof ReportSynthesisOutputOpenAiSchema
>;
