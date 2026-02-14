import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const scoringWeightsSchema = z.object({
  team: z.number().int().min(0).max(100),
  market: z.number().int().min(0).max(100),
  product: z.number().int().min(0).max(100),
  traction: z.number().int().min(0).max(100),
  businessModel: z.number().int().min(0).max(100),
  gtm: z.number().int().min(0).max(100),
  financials: z.number().int().min(0).max(100),
  competitiveAdvantage: z.number().int().min(0).max(100),
  legal: z.number().int().min(0).max(100),
  dealTerms: z.number().int().min(0).max(100),
  exitPotential: z.number().int().min(0).max(100),
});

const scoringRationaleSchema = z.object({
  team: z.string().max(2000),
  market: z.string().max(2000),
  product: z.string().max(2000),
  traction: z.string().max(2000),
  businessModel: z.string().max(2000),
  gtm: z.string().max(2000),
  financials: z.string().max(2000),
  competitiveAdvantage: z.string().max(2000),
  legal: z.string().max(2000),
  dealTerms: z.string().max(2000),
  exitPotential: z.string().max(2000),
});

export const UpdateScoringPreferencesSchema = z
  .object({
    useCustomWeights: z.boolean(),
    customWeights: scoringWeightsSchema
      .refine((w) => Object.values(w).reduce((a, b) => a + b, 0) === 100, {
        message: 'Weights must sum to 100',
      })
      .optional()
      .nullable(),
    customRationale: scoringRationaleSchema.optional().nullable(),
  })
  .refine(
    (data) => !data.useCustomWeights || data.customWeights != null,
    { message: 'customWeights required when useCustomWeights is true' },
  );

export type UpdateScoringPreferences = z.infer<
  typeof UpdateScoringPreferencesSchema
>;
export class UpdateScoringPreferencesDto extends createZodDto(
  UpdateScoringPreferencesSchema,
) {}
