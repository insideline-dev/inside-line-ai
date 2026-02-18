import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const ProgressAgentSchema = z.object({
  key: z.string(),
  status: z.string(),
  progress: z.number().min(0).max(100).optional(),
  startedAt: z.string().optional(),
  completedAt: z.string().optional(),
  error: z.string().optional(),
  attempts: z.number().int().min(0).optional(),
  retryCount: z.number().int().min(0).optional(),
  phaseRetryCount: z.number().int().min(0).optional(),
  agentAttemptId: z.string().optional(),
  usedFallback: z.boolean().optional(),
  fallbackReason: z
    .enum([
      "EMPTY_STRUCTURED_OUTPUT",
      "TIMEOUT",
      "SCHEMA_OUTPUT_INVALID",
      "MODEL_OR_PROVIDER_ERROR",
      "UNHANDLED_AGENT_EXCEPTION",
    ])
    .optional(),
  rawProviderError: z.string().optional(),
  lastEvent: z
    .enum(["started", "retrying", "completed", "failed", "fallback"])
    .optional(),
  lastEventAt: z.string().optional(),
});

export const ProgressPhaseSchema = z.object({
  status: z.string(),
  progress: z.number().min(0).max(100),
  startedAt: z.string().optional(),
  completedAt: z.string().optional(),
  error: z.string().optional(),
  retryCount: z.number().int().min(0).optional(),
  agents: z.record(z.string(), ProgressAgentSchema).optional(),
});

export const ProgressAgentEventSchema = z.object({
  id: z.string(),
  pipelineRunId: z.string().optional(),
  phase: z.string(),
  agentKey: z.string(),
  event: z.enum(["started", "retrying", "completed", "failed", "fallback"]),
  timestamp: z.string(),
  attempt: z.number().int().min(1).optional(),
  retryCount: z.number().int().min(0).optional(),
  phaseRetryCount: z.number().int().min(0).optional(),
  agentAttemptId: z.string().optional(),
  error: z.string().optional(),
  fallbackReason: z
    .enum([
      "EMPTY_STRUCTURED_OUTPUT",
      "TIMEOUT",
      "SCHEMA_OUTPUT_INVALID",
      "MODEL_OR_PROVIDER_ERROR",
      "UNHANDLED_AGENT_EXCEPTION",
    ])
    .optional(),
  rawProviderError: z.string().optional(),
});

export const ProgressAgentTraceSchema = z.object({
  id: z.string(),
  pipelineRunId: z.string(),
  phase: z.string(),
  agentKey: z.string(),
  status: z.enum(["running", "completed", "failed", "fallback"]),
  attempt: z.number().int().min(0).optional(),
  retryCount: z.number().int().min(0).optional(),
  usedFallback: z.boolean().optional(),
  inputPrompt: z.string().nullable().optional(),
  outputText: z.string().nullable().optional(),
  outputJson: z.unknown().optional(),
  error: z.string().nullable().optional(),
  fallbackReason: z
    .enum([
      "EMPTY_STRUCTURED_OUTPUT",
      "TIMEOUT",
      "SCHEMA_OUTPUT_INVALID",
      "MODEL_OR_PROVIDER_ERROR",
      "UNHANDLED_AGENT_EXCEPTION",
    ])
    .optional(),
  rawProviderError: z.string().optional(),
  captureStatus: z.enum(["captured", "missing", "provider_error_only"]).optional(),
  startedAt: z.string().optional(),
  completedAt: z.string().nullable().optional(),
});

export const ProgressSchema = z.object({
  overallProgress: z.number().min(0).max(100),
  currentPhase: z.string(),
  phasesCompleted: z.array(z.string()),
  pipelineStatus: z.string().optional(),
  pipelineRunId: z.string().optional(),
  estimatedTimeRemaining: z.number().optional(),
  error: z.string().optional(),
  updatedAt: z.string().optional(),
  phases: z.record(z.string(), ProgressPhaseSchema),
  agentEvents: z.array(ProgressAgentEventSchema).optional(),
  agentTraces: z.array(ProgressAgentTraceSchema).optional(),
});

export const GetProgressResponseSchema = z.object({
  status: z.enum(['draft', 'submitted', 'analyzing', 'pending_review', 'approved', 'rejected']),
  progress: ProgressSchema.nullable(),
});

export type GetProgressResponse = z.infer<typeof GetProgressResponseSchema>;

export class ProgressPhaseDto extends createZodDto(ProgressPhaseSchema) {}

export class ProgressDto extends createZodDto(ProgressSchema) {}

export class GetProgressResponseDto extends createZodDto(
  GetProgressResponseSchema,
) {}
