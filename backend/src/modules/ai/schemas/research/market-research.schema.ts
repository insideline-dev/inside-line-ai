import { z } from "zod";

export const MarketCompetitorSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  fundingRaised: z.number().nonnegative().optional(),
  url: z.string().url().optional(),
});

export const MarketIndirectCompetitorSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  whyIndirect: z.string().min(1).optional(),
  threatLevel: z.enum(["high", "medium", "low"]).optional(),
  url: z.string().url().optional(),
});

export const MarketResearchSchema = z.object({
  marketReports: z.array(z.string()).default([]),
  competitors: z.array(MarketCompetitorSchema).default([]),
  indirectCompetitors: z.array(z.string()).default([]),
  indirectCompetitorsDetailed: z.array(MarketIndirectCompetitorSchema).default([]),
  marketTrends: z.array(z.string()).default([]),
  marketSize: z
    .object({
      tam: z.number().nonnegative().optional(),
      sam: z.number().nonnegative().optional(),
      som: z.number().nonnegative().optional(),
    })
    .default({}),
  sources: z.array(z.string().url()).default([]),
});

export type MarketResearch = z.infer<typeof MarketResearchSchema>;
