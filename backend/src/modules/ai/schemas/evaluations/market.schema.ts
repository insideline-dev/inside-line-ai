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

const requiredStringFromNull = (fallback: string) =>
  z.preprocess(
    (value) => (value === null ? fallback : value),
    z.string().min(1),
  );

const MarketCompetitorDetailSchema = z.object({
  name: requiredStringFromNull("Unknown competitor"),
  description: requiredStringFromNull("Description unavailable"),
  url: optionalUrl,
  fundingRaised: optionalNonNegativeNumber,
});

const MarketIndirectCompetitorDetailSchema = z.object({
  name: requiredStringFromNull("Unknown competitor"),
  description: requiredStringFromNull("Description unavailable"),
  whyIndirect: optionalString,
  url: optionalUrl,
  threatLevel: optionalThreatLevel,
});

export const MarketEvaluationSchema = BaseEvaluationSchema.extend({
  marketSize: requiredStringFromNull("Market size requires manual review"),
  marketGrowth: requiredStringFromNull("Market growth requires manual review"),
  tamEstimate: optionalNonNegativeNumber,
  marketTiming: requiredStringFromNull("Market timing requires manual review"),
  credibilityScore: z.number().int().min(0).max(100),
  directCompetitors: z.array(z.string()).default([]),
  indirectCompetitors: z.array(z.string()).default([]),
  directCompetitorsDetailed: z.array(MarketCompetitorDetailSchema).default([]),
  indirectCompetitorsDetailed: z.array(MarketIndirectCompetitorDetailSchema).default([]),
});

export type MarketEvaluation = z.infer<typeof MarketEvaluationSchema>;
