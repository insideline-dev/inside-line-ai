import { createZodDto } from "nestjs-zod";
import { z } from "zod";
import { StartupStage } from "../../startup/entities/startup.schema";

const TeamMemberSchema = z.object({
  name: z.string().min(1).max(200),
  role: z.string().min(1).max(200),
  linkedinUrl: z.string().url().optional(),
});

export const QuickCreateStartupSchema = z.object({
  name: z.string().min(1).max(200),
  tagline: z.string().min(1).max(500),
  description: z.string().min(10).max(5000),
  website: z.string().url(),
  location: z.string().min(1).max(200),
  industry: z.string().min(1).max(200),
  stage: z.nativeEnum(StartupStage),
  fundingTarget: z.coerce.number().int().nonnegative(),
  teamSize: z.coerce.number().int().positive(),
  teamMembers: z.array(TeamMemberSchema).max(50).optional(),
  pitchDeckUrl: z.string().url().optional(),
});

export type QuickCreateStartup = z.infer<typeof QuickCreateStartupSchema>;

export class QuickCreateStartupDto extends createZodDto(QuickCreateStartupSchema) {}
