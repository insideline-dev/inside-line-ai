import { z } from "zod";
import { DeckStructuredDataSchema } from "./deck-structured-data.schema";
import { DocumentCategory } from "../interfaces/document-classification.interface";

const StartupFileReferenceSchema = z.object({
  path: z.string().min(1),
  name: z.string().min(1),
  type: z.string().min(1),
  category: z.nativeEnum(DocumentCategory).optional(),
  confidence: z.number().min(0).max(1).optional(),
});

const StartupTeamMemberReferenceSchema = z.object({
  name: z.string().min(1),
  role: z.string().optional(),
  linkedinUrl: z.string().url().optional(),
});

const StartupFormContextSchema = z.object({
  sectorIndustryGroup: z.string().optional().nullable(),
  sectorIndustry: z.string().optional().nullable(),
  pitchDeckPath: z.string().optional().nullable(),
  pitchDeckUrl: z.string().optional().nullable(),
  demoUrl: z.string().optional().nullable(),
  logoUrl: z.string().optional().nullable(),
  files: z.array(StartupFileReferenceSchema).optional(),
  teamMembers: z.array(StartupTeamMemberReferenceSchema).optional(),
  roundCurrency: z.string().optional().nullable(),
  valuationKnown: z.boolean().optional().nullable(),
  valuationType: z.string().optional().nullable(),
  raiseType: z.string().optional().nullable(),
  leadSecured: z.boolean().optional().nullable(),
  leadInvestorName: z.string().optional().nullable(),
  contactName: z.string().optional().nullable(),
  contactEmail: z.string().optional().nullable(),
  contactPhone: z.string().optional().nullable(),
  contactPhoneCountryCode: z.string().optional().nullable(),
  hasPreviousFunding: z.boolean().optional().nullable(),
  previousFundingAmount: z.number().nonnegative().optional().nullable(),
  previousFundingCurrency: z.string().optional().nullable(),
  previousInvestors: z.string().optional().nullable(),
  previousRoundType: z.string().optional().nullable(),
  technologyReadinessLevel: z.string().optional().nullable(),
  demoVideoUrl: z.string().optional().nullable(),
  productDescription: z.string().optional().nullable(),
  productScreenshots: z.array(z.string()).optional(),
});

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
  startupContext: StartupFormContextSchema.optional().default({}),
  source: z
    .enum(["pdf-parse", "pptx-parse", "mistral-ocr", "startup-context"])
    .optional()
    .default("startup-context"),
  pageCount: z.number().int().nonnegative().optional(),
  warnings: z.array(z.string()).optional().default([]),
  deckStructuredData: DeckStructuredDataSchema.optional(),
});

export type Extraction = z.infer<typeof ExtractionSchema>;
