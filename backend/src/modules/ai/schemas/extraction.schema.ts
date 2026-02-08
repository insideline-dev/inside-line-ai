import { z } from "zod";

export const ExtractionSchema = z.object({
  companyName: z.string().min(1),
  tagline: z.string().optional().default(""),
  founderNames: z.array(z.string()).default([]),
  industry: z.string().min(1),
  stage: z.string().min(1),
  location: z.string().min(1).optional().default(""),
  website: z.string().url().or(z.literal("")),
  fundingAsk: z.number().nonnegative().optional(),
  valuation: z.number().nonnegative().optional(),
  rawText: z.string().default(""),
  source: z
    .enum(["pdf-parse", "mistral-ocr", "startup-context"])
    .optional()
    .default("startup-context"),
  pageCount: z.number().int().nonnegative().optional(),
  warnings: z.array(z.string()).optional().default([]),
});

export type Extraction = z.infer<typeof ExtractionSchema>;
