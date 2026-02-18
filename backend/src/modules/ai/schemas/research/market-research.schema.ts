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

const requiredStringFromNull = (fallback: string) =>
  z.preprocess(
    (value) => (value === null ? fallback : value),
    z.string().min(1),
  );

const stringArray = z.preprocess(
  (value) =>
    Array.isArray(value)
      ? value.filter((item): item is string => typeof item === "string")
      : [],
  z.array(z.string()),
).default([]);

const urlArray = z.preprocess(
  (value) =>
    Array.isArray(value)
      ? value.filter((item): item is string => typeof item === "string")
      : [],
  z.array(z.string().url()),
).default([]);

const optionalThreatLevel = z.preprocess(
  nullToUndefined,
  z.enum(["high", "medium", "low"]).optional(),
);

export const MarketCompetitorSchema = z.object({
  name: requiredStringFromNull("Unknown competitor"),
  description: requiredStringFromNull("Description unavailable"),
  fundingRaised: optionalNonNegativeNumber,
  url: optionalUrl,
});

export const MarketIndirectCompetitorSchema = z.object({
  name: requiredStringFromNull("Unknown competitor"),
  description: requiredStringFromNull("Description unavailable"),
  whyIndirect: optionalString,
  threatLevel: optionalThreatLevel,
  url: optionalUrl,
});

export const MarketResearchSchema = z.object({
  marketReports: stringArray,
  competitors: z.array(MarketCompetitorSchema).default([]),
  indirectCompetitors: stringArray,
  indirectCompetitorsDetailed: z.array(MarketIndirectCompetitorSchema).default([]),
  marketTrends: stringArray,
  marketSize: z
    .object({
      tam: optionalNonNegativeNumber,
      sam: optionalNonNegativeNumber,
      som: optionalNonNegativeNumber,
    })
    .default({}),
  sources: urlArray,
});

export type MarketResearch = z.infer<typeof MarketResearchSchema>;
