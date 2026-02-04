import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const ApproveStartupSchema = z.object({});

export type ApproveStartup = z.infer<typeof ApproveStartupSchema>;
export class ApproveStartupDto extends createZodDto(ApproveStartupSchema) {}
