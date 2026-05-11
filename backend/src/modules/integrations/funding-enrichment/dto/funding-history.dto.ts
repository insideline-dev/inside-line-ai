import { createZodDto } from "nestjs-zod";
import { z } from "zod";

export const FundingHistorySourceEntrySchema = z.object({
  provider: z.enum(["crunchbase", "public_filing", "press_release"]),
  sourceUrl: z.string().url(),
  fetchedAt: z.string(),
  reportedAmount: z.number().nullable().optional(),
  reportedCurrency: z.string().nullable().optional(),
  reportedAnnouncedAt: z.string().nullable().optional(),
  reportedLeadInvestor: z.string().nullable().optional(),
  conflictsWith: z.array(z.string()).optional(),
});

export const FundingHistoryRowSchema = z.object({
  id: z.string(),
  startupId: z.string(),
  roundType: z.string(),
  announcedAt: z.string().nullable(),
  amount: z.string().nullable(),
  currency: z.string().nullable(),
  valuationPostMoney: z.string().nullable(),
  leadInvestor: z.string().nullable(),
  investors: z.array(z.string()).nullable(),
  sources: z.array(FundingHistorySourceEntrySchema),
  evidenceConfidence: z.string().nullable(),
  lastReconciledAt: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const FundingHistoryListResponseSchema = z.object({
  startupId: z.string(),
  rows: z.array(FundingHistoryRowSchema),
  /** True when there are zero rows for graceful-fallback UI */
  empty: z.boolean(),
});

export const EnrichFundingResponseSchema = z.object({
  startupId: z.string(),
  providersAttempted: z.array(z.string()),
  providersWithMatches: z.array(z.string()),
  rows: z.array(FundingHistoryRowSchema),
});

export type FundingHistorySourceEntryDtoShape = z.infer<
  typeof FundingHistorySourceEntrySchema
>;
export type FundingHistoryRowDtoShape = z.infer<typeof FundingHistoryRowSchema>;
export type FundingHistoryListResponseDtoShape = z.infer<
  typeof FundingHistoryListResponseSchema
>;
export type EnrichFundingResponseDtoShape = z.infer<
  typeof EnrichFundingResponseSchema
>;

export class FundingHistoryRowDto extends createZodDto(
  FundingHistoryRowSchema,
) {}

export class FundingHistoryListResponseDto extends createZodDto(
  FundingHistoryListResponseSchema,
) {}

export class EnrichFundingResponseDto extends createZodDto(
  EnrichFundingResponseSchema,
) {}
