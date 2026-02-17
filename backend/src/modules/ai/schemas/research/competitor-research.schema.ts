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

export const CompetitorDetailSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  website: optionalUrl,
  fundingRaised: optionalNonNegativeNumber,
  fundingStage: optionalString,
  employeeCount: optionalNonNegativeNumber,
  productOverview: z.string(),
  keyFeatures: z.array(z.string()).default([]),
  pricing: optionalString,
  targetMarket: optionalString,
  differentiators: z.array(z.string()).default([]),
  weaknesses: z.array(z.string()).default([]),
  threatLevel: optionalThreatLevel,
});

export const IndirectCompetitorDetailSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  whyIndirect: z.string().min(1),
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
