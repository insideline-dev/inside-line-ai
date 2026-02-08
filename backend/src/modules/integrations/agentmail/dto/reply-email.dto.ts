import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const ReplyEmailSchema = z
  .object({
    text: z.string().optional(),
    html: z.string().optional(),
  })
  .refine((data) => data.text || data.html, {
    message: 'At least one of text or html is required',
  });

export type ReplyEmail = z.infer<typeof ReplyEmailSchema>;
export class ReplyEmailDto extends createZodDto(ReplyEmailSchema) {}
