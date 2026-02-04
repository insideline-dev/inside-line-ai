import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const SubmitStartupSchema = z.object({});

export type SubmitStartup = z.infer<typeof SubmitStartupSchema>;
export class SubmitStartupDto extends createZodDto(SubmitStartupSchema) {}
