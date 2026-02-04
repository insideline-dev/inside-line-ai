import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { StartupStage } from '../entities/startup.schema';

export const CreateStartupSchema = z.object({
  name: z.string().min(1).max(200),
  tagline: z.string().min(1).max(500),
  description: z.string().min(100).max(5000),
  website: z.string().url(),
  location: z.string().min(1).max(200),
  industry: z.string().min(1).max(200),
  stage: z.nativeEnum(StartupStage),
  fundingTarget: z.number().int().positive(),
  teamSize: z.number().int().positive(),
  pitchDeckUrl: z.string().url().optional(),
  demoUrl: z.string().url().optional(),
});

export type CreateStartup = z.infer<typeof CreateStartupSchema>;
export class CreateStartupDto extends createZodDto(CreateStartupSchema) {}
