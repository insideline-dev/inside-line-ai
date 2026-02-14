import { z } from "zod";

export const CompetitorDetailSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  website: z.string().url().optional(),
  fundingRaised: z.number().nonnegative().optional(),
  fundingStage: z.string().optional(),
  employeeCount: z.number().nonnegative().optional(),
  productOverview: z.string(),
  keyFeatures: z.array(z.string()).default([]),
  pricing: z.string().optional(),
  targetMarket: z.string().optional(),
  differentiators: z.array(z.string()).default([]),
  weaknesses: z.array(z.string()).default([]),
  threatLevel: z.enum(["high", "medium", "low"]).optional(),
});

export const IndirectCompetitorDetailSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  whyIndirect: z.string().min(1),
  threatLevel: z.enum(["high", "medium", "low"]).optional(),
  website: z.string().url().optional(),
});

export const CompetitorResearchSchema = z.object({
  competitors: z.array(CompetitorDetailSchema).default([]),
  indirectCompetitors: z.array(IndirectCompetitorDetailSchema).default([]),
  marketPositioning: z.string().default(""),
  competitiveLandscapeSummary: z.string().default(""),
  sources: z.array(z.string().url()).default([]),
});

export type CompetitorResearch = z.infer<typeof CompetitorResearchSchema>;
