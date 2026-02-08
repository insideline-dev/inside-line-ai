import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const SendEmailSchema = z.object({
  to: z.array(z.string().email()).min(1),
  subject: z.string().optional(),
  text: z.string().optional(),
  html: z.string().optional(),
  cc: z.array(z.string().email()).optional(),
  bcc: z.array(z.string().email()).optional(),
});

export type SendEmail = z.infer<typeof SendEmailSchema>;
export class SendEmailDto extends createZodDto(SendEmailSchema) {}
