import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { StartupStage } from '../../startup/entities/startup.schema';

export const SubmitToPortalSchema = z.object({
  // Startup data
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

  // Optional founder email (for user creation/lookup)
  founderEmail: z.string().email().optional(),
  founderName: z.string().min(1).max(200).optional(),
});

export type SubmitToPortal = z.infer<typeof SubmitToPortalSchema>;
export class SubmitToPortalDto extends createZodDto(SubmitToPortalSchema) {}
