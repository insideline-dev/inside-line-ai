import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const UpdateMatchStatusSchema = z
  .object({
    status: z.enum(['new', 'reviewing', 'engaged', 'closed', 'passed']),
    passReason: z.string().max(500).optional(),
    passNotes: z.string().max(5000).optional(),
    investmentAmount: z.number().positive().optional(),
    investmentCurrency: z.string().max(10).optional(),
    investmentDate: z.string().datetime().optional(),
    investmentNotes: z.string().max(5000).optional(),
    meetingRequested: z.boolean().optional(),
  })
  .refine(
    (data) => {
      if (data.status === 'passed') return !!data.passReason;
      return true;
    },
    { message: 'passReason is required when status is passed', path: ['passReason'] },
  )
  .refine(
    (data) => {
      if (data.status === 'closed') return data.investmentAmount != null;
      return true;
    },
    { message: 'investmentAmount is required when status is closed', path: ['investmentAmount'] },
  );

export type UpdateMatchStatus = z.infer<typeof UpdateMatchStatusSchema>;

export class UpdateMatchStatusDto extends createZodDto(UpdateMatchStatusSchema) {}
