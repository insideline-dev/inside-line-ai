import { z } from "zod";
import { BaseEvaluationSchema } from "../base-evaluation.schema";

const nullToUndefined = (value: unknown): unknown =>
  value === null ? undefined : value;

const optionalString = z.preprocess(
  nullToUndefined,
  z.string().optional(),
);

const optionalNonNegativeNumber = z.preprocess(
  nullToUndefined,
  z.number().nonnegative().optional(),
);

export const FundingHistoryEntrySchema = z.object({
  round: z.string().min(1),
  amount: z.number().nonnegative(),
  date: optionalString,
});

export const FinancialsEvaluationSchema = BaseEvaluationSchema.extend({
  burnRate: optionalNonNegativeNumber,
  runway: optionalNonNegativeNumber,
  fundingHistory: z.array(FundingHistoryEntrySchema).default([]),
  financialHealth: z.string().min(1),
});

export type FinancialsEvaluation = z.infer<typeof FinancialsEvaluationSchema>;
