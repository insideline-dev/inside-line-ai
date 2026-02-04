import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';

export const twilioConfigSchema = z.object({
  accountSid: z.string().min(1),
  authToken: z.string().min(1),
  whatsappNumber: z.string().regex(/^\+\d{10,15}$/, 'Phone number must be in E.164 format (+1234567890)'),
});

export class TwilioConfigDto extends createZodDto(twilioConfigSchema) {}
