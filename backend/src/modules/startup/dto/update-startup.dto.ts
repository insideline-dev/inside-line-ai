import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { CreateStartupSchema } from './create-startup.dto';

export const UpdateStartupSchema = CreateStartupSchema.partial();

export type UpdateStartup = z.infer<typeof UpdateStartupSchema>;
export class UpdateStartupDto extends createZodDto(UpdateStartupSchema) {}
