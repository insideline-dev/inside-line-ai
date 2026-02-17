import { z } from "zod";
import { BaseEvaluationSchema } from "../base-evaluation.schema";

const nullToUndefined = (value: unknown): unknown =>
  value === null ? undefined : value;

const optionalUrl = z.preprocess(
  nullToUndefined,
  z.string().url().optional(),
);

const optionalNonNegativeNumber = z.preprocess(
  nullToUndefined,
  z.number().nonnegative().optional(),
);

const optionalString = z.preprocess(
  nullToUndefined,
  z.string().min(1).optional(),
);

const optionalThreatLevel = z.preprocess(
  nullToUndefined,
  z.enum(["high", "medium", "low"]).optional(),
);

const MarketCompetitorDetailSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  url: optionalUrl,
  fundingRaised: optionalNonNegativeNumber,
});

const MarketIndirectCompetitorDetailSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  whyIndirect: optionalString,
  url: optionalUrl,
  threatLevel: optionalThreatLevel,
});

export const MarketEvaluationSchema = BaseEvaluationSchema.extend({
  marketSize: z.string().min(1),
  marketGrowth: z.string().min(1),
  tamEstimate: optionalNonNegativeNumber,
  marketTiming: z.string().min(1),
  credibilityScore: z.number().int().min(0).max(100),
  directCompetitors: z.array(z.string()).default([]),
  indirectCompetitors: z.array(z.string()).default([]),
  directCompetitorsDetailed: z.array(MarketCompetitorDetailSchema).default([]),
  indirectCompetitorsDetailed: z.array(MarketIndirectCompetitorDetailSchema).default([]),
});

export type MarketEvaluation = z.infer<typeof MarketEvaluationSchema>;
