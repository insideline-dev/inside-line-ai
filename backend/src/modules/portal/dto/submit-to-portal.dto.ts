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

  /**
   * DS-E1-F2-S2: founder distribution control. When 'this_fund_only' the
   * resulting startup is marked private so the cross-matching engine won't
   * fan it out to other investors. When 'all_aligned' (default) the deal is
   * eligible for cross-matching to any investor whose thesis fits.
   */
  distributionMode: z.enum(['all_aligned', 'this_fund_only', 'select_investors']).optional(),
  selectedInvestorIds: z.array(z.string().uuid()).optional(),
}).refine(
  (data) =>
    data.distributionMode !== 'select_investors' ||
    (data.selectedInvestorIds && data.selectedInvestorIds.length > 0),
  {
    message: 'At least one investor must be selected when using select_investors mode',
    path: ['selectedInvestorIds'],
  },
);

export type SubmitToPortal = z.infer<typeof SubmitToPortalSchema>;
export class SubmitToPortalDto extends createZodDto(SubmitToPortalSchema) {}
