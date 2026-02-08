import { z } from "zod";
import { BaseEvaluationSchema } from "../base-evaluation.schema";

export const FundingHistoryEntrySchema = z.object({
  round: z.string().min(1),
  amount: z.number().nonnegative(),
  date: z.string().optional(),
});

export const FinancialsEvaluationSchema = BaseEvaluationSchema.extend({
  burnRate: z.number().nonnegative(),
  runway: z.number().nonnegative(),
  fundingHistory: z.array(FundingHistoryEntrySchema).default([]),
  financialHealth: z.string().min(1),
});

export type FinancialsEvaluation = z.infer<typeof FinancialsEvaluationSchema>;
