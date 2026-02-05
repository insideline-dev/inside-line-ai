import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { InvestorInterestStatus } from '../entities/investor-interest.schema';

export const RespondInterestSchema = z.object({
  response: z.nativeEnum(InvestorInterestStatus),
});

export type RespondInterest = z.infer<typeof RespondInterestSchema>;

export class RespondInterestDto extends createZodDto(RespondInterestSchema) {}
