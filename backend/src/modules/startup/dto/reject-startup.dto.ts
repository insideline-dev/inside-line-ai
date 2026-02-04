import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const RejectStartupSchema = z.object({
  rejectionReason: z.string().min(10).max(1000),
});

export type RejectStartup = z.infer<typeof RejectStartupSchema>;
export class RejectStartupDto extends createZodDto(RejectStartupSchema) {}
