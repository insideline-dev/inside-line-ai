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

const FounderReportSchema = z.object({
  summary: requiredString("Founder report summary unavailable."),
  whatsWorking: stringArrayWithFallback,
  pathToInevitability: stringArrayWithFallback,
});

export const ReportSynthesisSchema = z.object({
  dealSnapshot: requiredString("Deal snapshot unavailable."),
  keyStrengths: z.array(z.string()).min(1),
  keyRisks: z.array(z.string()).min(1),
  exitScenarios: z.preprocess(
    (value) => (Array.isArray(value) ? value : []),
    z.array(ExitScenarioSchema),
  ),
  founderReport: FounderReportSchema,
  dataConfidenceNotes: requiredString("Confidence notes unavailable."),
});

export type ReportSynthesis = z.infer<typeof ReportSynthesisSchema>;
export type ReportFounderReport = z.infer<typeof FounderReportSchema>;
