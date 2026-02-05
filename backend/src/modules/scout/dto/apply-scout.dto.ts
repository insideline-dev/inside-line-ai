import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const ApplyScoutSchema = z.object({
  investorId: z.string().uuid(),
  name: z.string().min(2).max(200),
  email: z.string().email(),
  linkedinUrl: z.string().url(),
  experience: z.string().min(100).max(1000),
  motivation: z.string().min(100).max(1000),
  dealflowSources: z.string().min(50).max(500),
  portfolio: z.array(z.string()).max(10).optional(),
});

export type ApplyScout = z.infer<typeof ApplyScoutSchema>;
export class ApplyScoutDto extends createZodDto(ApplyScoutSchema) {}
