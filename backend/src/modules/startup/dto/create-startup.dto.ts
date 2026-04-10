import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import {
  RaiseType,
  StartupStage,
  TRL,
  ValuationType,
} from '../entities/startup.schema';

const StartupFileSchema = z.object({
  path: z.string().min(1).max(1000),
  name: z.string().min(1).max(255),
  type: z.string().min(1).max(255),
});

const TeamMemberSchema = z.object({
  name: z.string().max(200),
  role: z.string().max(200),
  linkedinUrl: z.string().max(500),
});

export const CreateStartupSchema = z.object({
  name: z.string().min(1).max(200),
  tagline: z.string().max(500).optional().default(""),
  description: z.string().max(5000).optional().default(""),
  website: z.string().url(),
  location: z.string().min(1).max(200),
  industry: z.string().min(1).max(200),
  stage: z.nativeEnum(StartupStage),
  fundingTarget: z.number().int().positive(),
  teamSize: z.number().int().positive(),
  sectorIndustryGroup: z.string().max(200).optional(),
  sectorIndustry: z.string().max(200).optional(),
  pitchDeckUrl: z.string().url().optional(),
  pitchDeckPath: z.string().max(1000).optional(),
  files: z.array(StartupFileSchema).max(20).optional(),
  teamMembers: z.array(TeamMemberSchema).max(50).optional(),
  roundCurrency: z.string().min(1).max(10).optional(),
  valuation: z.number().positive().optional(),
  valuationKnown: z.boolean().optional(),
  valuationType: z.nativeEnum(ValuationType).optional(),
  raiseType: z.nativeEnum(RaiseType).optional(),
  leadSecured: z.boolean().optional(),
  leadInvestorName: z.string().max(200).optional(),
  contactName: z.string().max(200).optional(),
  contactEmail: z.string().email().max(320).optional(),
  contactPhone: z.string().max(50).optional(),
  contactPhoneCountryCode: z.string().max(5).optional(),
  hasPreviousFunding: z.boolean().optional(),
  previousFundingAmount: z.number().positive().optional(),
  previousFundingCurrency: z.string().min(1).max(10).optional(),
  previousInvestors: z.string().max(5000).optional(),
  previousRoundType: z.string().max(100).optional(),
  technologyReadinessLevel: z.nativeEnum(TRL).optional(),
  demoVideoUrl: z.string().url().optional(),
  productDescription: z.string().max(10000).optional(),
  productScreenshots: z.array(z.string().max(1000)).max(20).optional(),
  demoUrl: z.string().url().optional(),
});

export type CreateStartup = z.infer<typeof CreateStartupSchema>;
export class CreateStartupDto extends createZodDto(CreateStartupSchema) {}
