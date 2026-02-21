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
  z.string().min(1).optional(),
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
  reviews: z.array(z.object({
    source: z.string(),
    rating: optionalString,
    summary: z.string(),
    url: optionalString,
  })).default([]),
  strengths: stringArray,
  weaknesses: stringArray,
  competitivePosition: optionalString,
  marketDynamics: z.object({
    entryBarriers: optionalString,
    substitutes: stringArray,
    buyerPower: optionalString,
    supplierPower: optionalString,
  }).optional(),
  sources: urlArray,
});

export type ProductResearch = z.infer<typeof ProductResearchSchema>;
