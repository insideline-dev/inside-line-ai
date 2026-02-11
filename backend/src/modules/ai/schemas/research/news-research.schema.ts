import { z } from "zod";

export const NewsArticleSchema = z.object({
  title: z.string().min(1),
  source: z.string().min(1),
  date: z.string().min(1),
  summary: z.string().min(1),
  url: z.string().url(),
});

export const NewsResearchSchema = z.object({
  articles: z.array(NewsArticleSchema).default([]),
  pressReleases: z.array(z.string()).default([]),
  sentiment: z.enum(["positive", "neutral", "negative"]).default("neutral"),
  recentEvents: z.array(z.string()).default([]),
  sources: z.array(z.string().url()).default([]),
});

export type NewsResearch = z.infer<typeof NewsResearchSchema>;
