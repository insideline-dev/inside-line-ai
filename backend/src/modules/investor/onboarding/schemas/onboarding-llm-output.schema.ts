import { z } from "zod";

/**
 * LLM-structured output for investor onboarding website draft (DS-E3-F1-S2).
 * Capped fields prevent runaway prompts and keep the persisted JSON small.
 */
export const OnboardingLlmOutputSchema = z.object({
  thesisSummary: z.string().min(1).max(2000),
  portfolioCompanies: z
    .array(
      z.object({
        name: z.string().min(1).max(120),
        description: z.string().max(280),
        // OpenAI structured outputs reject `.optional()` without `.nullable()`.
        // Use nullish so the LLM can return null OR omit the field; the
        // processor coerces null → undefined before persistence.
        websiteUrl: z.string().url().nullish(),
      }),
    )
    .max(50),
});

export type OnboardingLlmOutput = z.infer<typeof OnboardingLlmOutputSchema>;
