import { createZodDto } from "nestjs-zod";
import { z } from "zod";

// DS-E11-F4-S1 — typed Swagger responses for the calibration endpoints so
// Orval can generate hooks instead of the frontend hand-writing fetch.

const CalibrationReasonCountSchema = z.object({
  reasonTag: z.string(),
  count: z.number().int(),
});

const CalibrationRecentMismatchSchema = z.object({
  startupId: z.string(),
  decidedAt: z.string(),
  mismatchType: z.enum(["false_positive", "false_negative", "soft_mismatch"]),
  modelVerdict: z.enum(["advance", "review", "reject"]),
  investorVerdict: z.enum(["advance", "pass", "hold"]),
  reasonTags: z.array(z.string()),
});

const CalibrationSummarySchema = z.object({
  totalDecisions: z.number().int(),
  decisionsWithTriage: z.number().int(),
  aligned: z.number().int(),
  falsePositive: z.number().int(),
  falseNegative: z.number().int(),
  softMismatch: z.number().int(),
  alignmentRate: z.number().nullable(),
  topOverrideReasons: z.array(CalibrationReasonCountSchema),
  recentMismatches: z.array(CalibrationRecentMismatchSchema),
});

export const CalibrationSnapshotResponseSchema = z.object({
  investorId: z.string().uuid(),
  status: z.enum(["queued", "running", "completed", "failed"]),
  summary: CalibrationSummarySchema,
  computedAt: z.string().nullable(),
  lastJobId: z.string().nullable(),
  lastError: z.string().nullable(),
  enqueuedAt: z.string().nullable(),
});

export const RecomputeCalibrationResponseSchema = z.object({
  investorId: z.string().uuid(),
  jobId: z.string(),
  status: z.enum(["queued", "in_progress"]),
  dedupedToExistingJob: z.boolean(),
});

export class CalibrationSnapshotResponseDto extends createZodDto(
  CalibrationSnapshotResponseSchema,
) {}

export class RecomputeCalibrationResponseDto extends createZodDto(
  RecomputeCalibrationResponseSchema,
) {}
