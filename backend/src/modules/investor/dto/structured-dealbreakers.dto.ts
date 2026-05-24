import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { StructuredDealbreakerRuleListSchema } from '../structured-dealbreaker';

// DS-E4-F3-S1 — request body for POST /investor/thesis/structured-dealbreakers.
export const UpdateStructuredDealbreakersSchema = z.object({
  rules: StructuredDealbreakerRuleListSchema,
});

export class UpdateStructuredDealbreakersDto extends createZodDto(
  UpdateStructuredDealbreakersSchema,
) {}
