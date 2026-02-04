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
