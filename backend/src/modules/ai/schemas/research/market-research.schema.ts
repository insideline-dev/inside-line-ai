import { z } from "zod";

const nullToUndefined = (value: unknown): unknown =>
  value === null ? undefined : value;

const optionalNonNegativeNumber = z.preprocess(
  nullToUndefined,
  z.number().nonnegative().optional(),
);

const optionalUrl = z.preprocess(
  nullToUndefined,
  z.string().url().optional(),
);

const optionalString = z.preprocess(
  nullToUndefined,
  z.string().min(1).optional(),
);

const optionalThreatLevel = z.preprocess(
  nullToUndefined,
  z.enum(["high", "medium", "low"]).optional(),
);

export const MarketCompetitorSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  fundingRaised: optionalNonNegativeNumber,
  url: optionalUrl,
});

export const MarketIndirectCompetitorSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  whyIndirect: optionalString,
  threatLevel: optionalThreatLevel,
  url: optionalUrl,
});

export const MarketResearchSchema = z.object({
  marketReports: z.array(z.string()).default([]),
  competitors: z.array(MarketCompetitorSchema).default([]),
  indirectCompetitors: z.array(z.string()).default([]),
  indirectCompetitorsDetailed: z.array(MarketIndirectCompetitorSchema).default([]),
  marketTrends: z.array(z.string()).default([]),
  marketSize: z
    .object({
      tam: optionalNonNegativeNumber,
      sam: optionalNonNegativeNumber,
      som: optionalNonNegativeNumber,
    })
    .default({}),
  sources: z.array(z.string().url()).default([]),
});

export type MarketResearch = z.infer<typeof MarketResearchSchema>;
