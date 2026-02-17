import { z } from "zod";

const nullToUndefined = (value: unknown): unknown =>
  value === null ? undefined : value;

const requiredStringFromNull = (fallback: string) =>
  z.preprocess(
    (value) => (value === null ? fallback : value),
    z.string().min(1),
  );

const optionalUrl = z.preprocess(
  nullToUndefined,
  z.string().url().optional(),
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

export const NewsArticleSchema = z.object({
  title: requiredStringFromNull("Untitled article"),
  source: requiredStringFromNull("Unknown source"),
  date: requiredStringFromNull("Unknown date"),
  summary: requiredStringFromNull("Summary unavailable"),
  url: optionalUrl,
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
