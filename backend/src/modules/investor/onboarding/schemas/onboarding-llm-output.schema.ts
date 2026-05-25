import { z } from "zod";

export const INDUSTRY_GROUP_VALUES = [
  "advertising",
  "agriculture_farming",
  "artificial_intelligence",
  "biotechnology",
  "blockchain_crypto",
  "commerce_shopping",
  "consumer_goods",
  "data_analytics",
  "education",
  "energy",
  "financial_services",
  "food_beverage",
  "hardware",
  "health_care",
  "lending_investments",
  "manufacturing",
  "media_entertainment",
  "mobile",
  "other",
  "payments",
  "professional_services",
  "real_estate",
  "sales_marketing",
  "security",
  "software",
  "sustainability",
  "transportation",
  "travel_tourism",
] as const;

export const FUNDING_STAGE_VALUES = [
  "pre_seed",
  "seed",
  "series_a",
  "series_b",
  "series_c",
  "series_d",
  "series_e",
  "series_f_plus",
] as const;

export const OnboardingLlmOutputSchema = z.object({
  thesisSummary: z.string().min(1).max(2000),
  industries: z.array(z.enum(INDUSTRY_GROUP_VALUES)).max(10).nullish(),
  stages: z.array(z.enum(FUNDING_STAGE_VALUES)).max(8).nullish(),
  checkSizeMin: z.number().nullish(),
  checkSizeMax: z.number().nullish(),
  portfolioCompanies: z
    .array(
      z.object({
        name: z.string().min(1).max(120),
        description: z.string().max(280),
        websiteUrl: z.string().nullish(),
      }),
    )
    .max(50),
});

export type OnboardingLlmOutput = z.infer<typeof OnboardingLlmOutputSchema>;
