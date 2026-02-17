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

const optionalString = z.preprocess(
  nullToUndefined,
  z.string().optional(),
);

const optionalSentiment = z.preprocess(
  nullToUndefined,
  z.enum(["positive", "neutral", "negative"]).optional(),
);

export const ProductResearchSchema = z.object({
  productPages: urlArray,
  features: stringArray,
  techStack: stringArray,
  integrations: stringArray,
  customerReviews: z
    .object({
      summary: optionalString,
      sentiment: optionalSentiment,
    })
    .default({}),
  sources: urlArray,
});

export type ProductResearch = z.infer<typeof ProductResearchSchema>;
