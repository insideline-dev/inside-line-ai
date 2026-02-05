import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const ScheduleMeetingSchema = z.object({
  investorId: z.string().uuid(),
  scheduledAt: z.string().datetime(),
  duration: z.number().int().positive().optional(),
  location: z.string().max(200).optional(),
  notes: z.string().max(2000).optional(),
});

export type ScheduleMeeting = z.infer<typeof ScheduleMeetingSchema>;

export class ScheduleMeetingDto extends createZodDto(ScheduleMeetingSchema) {}
