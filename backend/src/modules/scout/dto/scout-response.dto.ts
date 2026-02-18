import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { ScoutApplicationStatus } from '../entities/scout.schema';

const PaginationMetaSchema = z.object({
  page: z.number().int().positive(),
  limit: z.number().int().positive(),
  total: z.number().int().min(0),
  totalPages: z.number().int().min(0),
});

const ScoutApplicationItemSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  investorId: z.string().uuid(),
  name: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  linkedinUrl: z.string().nullable().optional(),
  experience: z.string().nullable().optional(),
  motivation: z.string().nullable().optional(),
  dealflowSources: z.string().nullable().optional(),
  portfolio: z.array(z.string()).nullable().optional(),
  status: z.nativeEnum(ScoutApplicationStatus),
  reviewedAt: z.string().nullable().optional(),
  reviewedBy: z.string().uuid().nullable().optional(),
  rejectionReason: z.string().nullable().optional(),
  createdAt: z.string(),
});

export const ScoutApplicationsResponseSchema = z.object({
  data: z.array(ScoutApplicationItemSchema),
  meta: PaginationMetaSchema,
});

const ScoutSubmissionItemSchema = z.object({
  id: z.string().uuid(),
  submissionId: z.string().uuid(),
  investorId: z.string().uuid(),
  investorName: z.string().nullable().optional(),
  investorEmail: z.string().nullable().optional(),
  commissionRate: z.number().int().nullable().optional(),
  notes: z.string().nullable().optional(),
  name: z.string(),
  tagline: z.string(),
  description: z.string(),
  website: z.string(),
  location: z.string(),
  industry: z.string(),
  stage: z.string(),
  fundingTarget: z.number().int(),
  teamSize: z.number().int(),
  status: z.string(),
  overallScore: z.number().nullable().optional(),
  roundCurrency: z.string().nullable().optional(),
  createdAt: z.string(),
  submittedAt: z.string().nullable().optional(),
  updatedAt: z.string().nullable().optional(),
});

export const ScoutSubmissionsResponseSchema = z.object({
  data: z.array(ScoutSubmissionItemSchema),
  meta: PaginationMetaSchema,
});

const ScoutInvestorItemSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  email: z.string().email(),
  image: z.string().nullable().optional(),
  hasApplied: z.boolean(),
  applicationStatus: z.nativeEnum(ScoutApplicationStatus).nullable(),
});

export const ScoutInvestorsResponseSchema = z.object({
  data: z.array(ScoutInvestorItemSchema),
});

const ScoutSubmissionLinkSchema = z.object({
  id: z.string().uuid(),
  scoutId: z.string().uuid(),
  startupId: z.string().uuid(),
  investorId: z.string().uuid(),
  commissionRate: z.number().int().nullable().optional(),
  notes: z.string().nullable().optional(),
  createdAt: z.string(),
});

export const ScoutSubmitResponseSchema = z.object({
  startup: z.record(z.string(), z.unknown()),
  submission: ScoutSubmissionLinkSchema,
});

export const ScoutStartupDetailResponseSchema = z.record(
  z.string(),
  z.unknown(),
);

const ScoutStartupMatchItemSchema = z.object({
  investorId: z.string().uuid(),
  investorName: z.string().nullable().optional(),
  overallScore: z.number().nullable().optional(),
  thesisFitScore: z.number().nullable().optional(),
  fitRationale: z.string().nullable().optional(),
  status: z.string().nullable().optional(),
  createdAt: z.string().nullable().optional(),
});

export const ScoutStartupMatchesResponseSchema = z.object({
  data: z.array(ScoutStartupMatchItemSchema),
});

export const ScoutCommissionsResponseSchema = z.array(
  z.object({
    id: z.string().uuid(),
    scoutId: z.string().uuid(),
    submissionId: z.string().uuid(),
    dealSize: z.number().int(),
    commissionRate: z.number().int(),
    commissionAmount: z.number().int(),
    status: z.string(),
    paidAt: z.string().nullable().optional(),
    createdAt: z.string(),
  }),
);

export const ScoutTotalEarningsResponseSchema = z.object({
  total: z.number().int(),
  pending: z.number().int(),
  paid: z.number().int(),
});

export const ScoutMetricsResponseSchema = z.object({
  totalSubmissions: z.number().int().min(0),
});

export const ScoutLeaderboardResponseSchema = z.array(
  z.object({
    id: z.string().uuid(),
    name: z.string(),
    submissions: z.number().int().min(0),
    conversions: z.number().int().min(0),
    earnings: z.number().int().min(0),
  }),
);

export class ScoutApplicationsResponseDto extends createZodDto(
  ScoutApplicationsResponseSchema,
) {}
export class ScoutSubmissionsResponseDto extends createZodDto(
  ScoutSubmissionsResponseSchema,
) {}
export class ScoutInvestorsResponseDto extends createZodDto(
  ScoutInvestorsResponseSchema,
) {}
export class ScoutSubmitResponseDto extends createZodDto(ScoutSubmitResponseSchema) {}
export class ScoutStartupDetailResponseDto extends createZodDto(
  ScoutStartupDetailResponseSchema,
) {}
export class ScoutStartupMatchesResponseDto extends createZodDto(
  ScoutStartupMatchesResponseSchema,
) {}
export class ScoutCommissionsResponseDto extends createZodDto(
  ScoutCommissionsResponseSchema,
) {}
export class ScoutTotalEarningsResponseDto extends createZodDto(
  ScoutTotalEarningsResponseSchema,
) {}
export class ScoutMetricsResponseDto extends createZodDto(
  ScoutMetricsResponseSchema,
) {}
export class ScoutLeaderboardResponseDto extends createZodDto(
  ScoutLeaderboardResponseSchema,
) {}
