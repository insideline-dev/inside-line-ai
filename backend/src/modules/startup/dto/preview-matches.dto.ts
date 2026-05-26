import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { StartupStage } from '../entities/startup.schema';

export const PreviewMatchesSchema = z.object({
  industry: z.string().min(1).max(200),
  stage: z.nativeEnum(StartupStage),
  location: z.string().min(1).max(200),
  fundingTarget: z.number().int().positive(),
});

export type PreviewMatches = z.infer<typeof PreviewMatchesSchema>;
export class PreviewMatchesDto extends createZodDto(PreviewMatchesSchema) {}
