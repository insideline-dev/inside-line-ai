import { z } from "zod";

export const ProductResearchSchema = z.object({
  productPages: z.array(z.string().url()).default([]),
  features: z.array(z.string()).default([]),
  techStack: z.array(z.string()).default([]),
  integrations: z.array(z.string()).default([]),
  customerReviews: z
    .object({
      summary: z.string().optional(),
      sentiment: z.enum(["positive", "neutral", "negative"]).optional(),
    })
    .default({}),
  sources: z.array(z.string().url()).default([]),
});

export type ProductResearch = z.infer<typeof ProductResearchSchema>;
