import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { CreateStartupSchema } from '../../startup/dto/create-startup.dto';

export const ScoutSubmitStartupSchema = z.object({
  investorId: z.string().uuid(),
  startupData: CreateStartupSchema,
  notes: z.string().max(500).optional(),
});

export type ScoutSubmitStartup = z.infer<typeof ScoutSubmitStartupSchema>;
export class ScoutSubmitStartupDto extends createZodDto(ScoutSubmitStartupSchema) {}
