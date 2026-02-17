import { z } from "zod";

const nullToUndefined = (value: unknown): unknown =>
  value === null ? undefined : value;

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

export const NewsArticleSchema = z.object({
  title: z.preprocess(nullToUndefined, z.string().min(1)),
  source: z.preprocess(nullToUndefined, z.string().min(1)),
  date: z.preprocess(nullToUndefined, z.string().min(1)),
  summary: z.preprocess(nullToUndefined, z.string().min(1)),
  url: z.preprocess(nullToUndefined, z.string().url()),
});

export const NewsResearchSchema = z.object({
  articles: z.preprocess(
    (value) => (Array.isArray(value) ? value : []),
    z.array(NewsArticleSchema),
  ).catch([]),
  pressReleases: stringArray,
  sentiment: z.enum(["positive", "neutral", "negative"]).default("neutral"),
  recentEvents: stringArray,
  sources: urlArray,
});

export type NewsResearch = z.infer<typeof NewsResearchSchema>;
