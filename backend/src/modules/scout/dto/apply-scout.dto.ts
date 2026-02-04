import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const ApplyScoutSchema = z.object({
  investorId: z.string().uuid(),
  bio: z.string().min(100).max(1000),
  linkedinUrl: z.string().url(),
  portfolio: z.array(z.string()).min(0).max(10),
});

export type ApplyScout = z.infer<typeof ApplyScoutSchema>;
export class ApplyScoutDto extends createZodDto(ApplyScoutSchema) {}
