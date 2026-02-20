import { z } from "zod";

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
  investorMemo: z.string().min(1),
  founderReport: z.string().min(1),
  dataConfidenceNotes: z.string().min(1),
});

export type Synthesis = z.infer<typeof SynthesisSchema>;
