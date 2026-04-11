import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { PrivateInvestorPipelineStatus } from '../entities/startup.schema';
import { CreateStartupSchema } from './create-startup.dto';

export const UpdateStartupSchema = CreateStartupSchema.partial().extend({
  privateInvestorPipelineStatus: z.nativeEnum(PrivateInvestorPipelineStatus).optional(),
});

export type UpdateStartup = z.infer<typeof UpdateStartupSchema>;
export class UpdateStartupDto extends createZodDto(UpdateStartupSchema) {}
