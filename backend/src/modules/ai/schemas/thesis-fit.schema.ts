import { z } from "zod";

export const FitStatusSchema = z.enum(["match", "borderline", "mismatch"]);
export type FitStatus = z.infer<typeof FitStatusSchema>;

export const FitAxisSchema = z.object({
  status: FitStatusSchema,
  note: z
    .string()
    .min(1)
    .describe(
      "One short sentence explaining the status. Reference the startup signal and the thesis criterion that drove the call.",
    ),
});
export type FitAxis = z.infer<typeof FitAxisSchema>;

/**
 * Per-axis, structured thesis-fit assessment.
 *
 * Replaces the previous hard-coded equality checks (e.g. `startup.geo === thesis.geo`)
 * that produced the California-vs-US false-mismatch in the 2026-05-14 client meeting.
 * The model now reads both sides as natural language and returns a calibrated status
 * per axis. Hard-coded filters are forbidden downstream.
 */
export const ThesisFitOutputSchema = z.object({
  geography: FitAxisSchema,
  stage: FitAxisSchema,
  sector: FitAxisSchema,
  checkSize: FitAxisSchema,
  overall: z
    .number()
    .min(0)
    .max(100)
    .describe(
      "Aggregate fit score. Roughly: 4 matches ≈ 90+, mixed ≈ 50–70, multiple mismatches ≈ 0–40.",
    ),
  rationale: z
    .string()
    .min(1)
    .describe("Two or three sentences summarising the overall call."),
});
export type ThesisFitOutput = z.infer<typeof ThesisFitOutputSchema>;
