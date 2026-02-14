import { z } from "zod";
import { BaseEvaluationSchema } from "../base-evaluation.schema";

const MarketCompetitorDetailSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  url: z.string().url().optional(),
  fundingRaised: z.number().nonnegative().optional(),
});

const MarketIndirectCompetitorDetailSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  whyIndirect: z.string().min(1).optional(),
  url: z.string().url().optional(),
  threatLevel: z.enum(["high", "medium", "low"]).optional(),
});

export const MarketEvaluationSchema = BaseEvaluationSchema.extend({
  marketSize: z.string().min(1),
  marketGrowth: z.string().min(1),
  tamEstimate: z.number().nonnegative().optional(),
  marketTiming: z.string().min(1),
  credibilityScore: z.number().int().min(0).max(100),
  directCompetitors: z.array(z.string()).default([]),
  indirectCompetitors: z.array(z.string()).default([]),
  directCompetitorsDetailed: z.array(MarketCompetitorDetailSchema).default([]),
  indirectCompetitorsDetailed: z.array(MarketIndirectCompetitorDetailSchema).default([]),
});

export type MarketEvaluation = z.infer<typeof MarketEvaluationSchema>;
