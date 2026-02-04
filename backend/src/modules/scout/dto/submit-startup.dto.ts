import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { CreateStartupSchema } from '../../startup/dto/create-startup.dto';

export const SubmitStartupSchema = z.object({
  investorId: z.string().uuid(),
  startupData: CreateStartupSchema,
  notes: z.string().max(500).optional(),
});

export type SubmitStartup = z.infer<typeof SubmitStartupSchema>;
export class SubmitStartupDto extends createZodDto(SubmitStartupSchema) {}
