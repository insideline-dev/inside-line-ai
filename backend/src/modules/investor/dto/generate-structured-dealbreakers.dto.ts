import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { StructuredDealbreakerRuleListSchema } from '../structured-dealbreaker';

export const GenerateStructuredDealbreakersSchema = z.object({
  narrative: z.string().min(12).max(4000),
});

export class GenerateStructuredDealbreakersDto extends createZodDto(
  GenerateStructuredDealbreakersSchema,
) {}

export const GenerateStructuredDealbreakersResponseSchema = z.object({
  rules: StructuredDealbreakerRuleListSchema,
});

export class GenerateStructuredDealbreakersResponseDto extends createZodDto(
  GenerateStructuredDealbreakersResponseSchema,
) {}
