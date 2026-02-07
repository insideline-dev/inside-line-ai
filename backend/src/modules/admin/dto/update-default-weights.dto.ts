import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const UpdateDefaultWeightsSchema = z
  .object({
    marketWeight: z.number().int().min(0).max(100),
    teamWeight: z.number().int().min(0).max(100),
    productWeight: z.number().int().min(0).max(100),
    tractionWeight: z.number().int().min(0).max(100),
    financialsWeight: z.number().int().min(0).max(100),
  })
  .refine(
    (data) =>
      data.marketWeight +
        data.teamWeight +
        data.productWeight +
        data.tractionWeight +
        data.financialsWeight ===
      100,
    { message: 'All weights must sum to 100' },
  );

export type UpdateDefaultWeights = z.infer<typeof UpdateDefaultWeightsSchema>;
export class UpdateDefaultWeightsDto extends createZodDto(
  UpdateDefaultWeightsSchema,
) {}

// ============================================================================
// Stage-based scoring weights (11-category, per-stage)
// ============================================================================

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
  team: z.string(),
  market: z.string(),
  product: z.string(),
  traction: z.string(),
  businessModel: z.string(),
  gtm: z.string(),
  financials: z.string(),
  competitiveAdvantage: z.string(),
  legal: z.string(),
  dealTerms: z.string(),
  exitPotential: z.string(),
});

export const UpdateStageWeightsSchema = z.object({
  weights: scoringWeightsSchema.refine(
    (w) => Object.values(w).reduce((a, b) => a + b, 0) === 100,
    { message: 'Weights must sum to 100' },
  ),
  rationale: scoringRationaleSchema,
  overallRationale: z.string().optional(),
});

export type UpdateStageWeights = z.infer<typeof UpdateStageWeightsSchema>;
export class UpdateStageWeightsDto extends createZodDto(
  UpdateStageWeightsSchema,
) {}
