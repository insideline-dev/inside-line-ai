import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const AddPortfolioSchema = z.object({
  startupId: z.string().uuid(),
  dealSize: z.number().int().positive().optional(),
  dealStage: z.string().max(100).optional(),
  investedAt: z.string().datetime().optional(),
  notes: z.string().max(2000).optional(),
});

export type AddPortfolio = z.infer<typeof AddPortfolioSchema>;

export class AddPortfolioDto extends createZodDto(AddPortfolioSchema) {}
