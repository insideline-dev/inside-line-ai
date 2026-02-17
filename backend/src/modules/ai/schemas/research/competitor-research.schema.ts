import { z } from "zod";

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
  z.string().optional(),
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

export const CompetitorDetailSchema = z.object({
  name: requiredStringFromNull("Unknown competitor"),
  description: requiredStringFromNull("Description unavailable"),
  website: optionalUrl,
  fundingRaised: optionalNonNegativeNumber,
  fundingStage: optionalString,
  employeeCount: optionalNonNegativeNumber,
  productOverview: requiredStringFromNull("Product overview unavailable"),
  keyFeatures: z.array(z.string()).default([]),
  pricing: optionalString,
  targetMarket: optionalString,
  differentiators: z.array(z.string()).default([]),
  weaknesses: z.array(z.string()).default([]),
  threatLevel: optionalThreatLevel,
});

export const IndirectCompetitorDetailSchema = z.object({
  name: requiredStringFromNull("Unknown competitor"),
  description: requiredStringFromNull("Description unavailable"),
  whyIndirect: requiredStringFromNull("Indirect relationship not specified"),
  threatLevel: optionalThreatLevel,
  website: optionalUrl,
});

export const CompetitorResearchSchema = z.object({
  competitors: z.array(CompetitorDetailSchema).default([]),
  indirectCompetitors: z.array(IndirectCompetitorDetailSchema).default([]),
  marketPositioning: z.string().default(""),
  competitiveLandscapeSummary: z.string().default(""),
  sources: z.array(z.string().url()).default([]),
});

export type CompetitorResearch = z.infer<typeof CompetitorResearchSchema>;
