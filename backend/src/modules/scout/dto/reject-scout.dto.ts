import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const RejectScoutSchema = z.object({
  rejectionReason: z.string().min(10).max(500),
});

export type RejectScout = z.infer<typeof RejectScoutSchema>;
export class RejectScoutDto extends createZodDto(RejectScoutSchema) {}
