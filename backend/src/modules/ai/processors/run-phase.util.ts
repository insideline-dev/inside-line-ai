import type { Job } from "bullmq";
import { Logger } from "@nestjs/common";
import {
  PhaseStatus,
  PipelinePhase,
  PipelineStatus,
} from "../interfaces/pipeline.interface";
import type { PhaseResultMap } from "../interfaces/pipeline.interface";
import type { PipelineStateService } from "../services/pipeline-state.service";
import type { PipelineService } from "../services/pipeline.service";
import type { NotificationGateway } from "../../../notification/notification.gateway";
import type { JobType } from "../../../notification/dto/job-status-event.dto";

const logger = new Logger("RunPipelinePhase");

interface RunPhaseOptions<P extends PipelinePhase> {
  job: Job<{ startupId: string; pipelineRunId: string; userId: string }>;
  phase: P;
  jobType: JobType;
  pipelineState: PipelineStateService;
  pipelineService: PipelineService;
  notificationGateway: NotificationGateway;
  run: () => Promise<PhaseResultMap[P]>;
}

export async function runPipelinePhase<P extends PipelinePhase>(
  options: RunPhaseOptions<P>,
): Promise<{
  startupId: string;
  pipelineRunId: string;
  userId: string;
  result: PhaseResultMap[P] | null;
}> {
  const { startupId, pipelineRunId, userId } = options.job.data;
  const jobRetryCount = readJobRetryCount(options.job);
  logger.log(`[${options.phase}] Job picked up | Startup: ${startupId} | Run: ${pipelineRunId}`);

  const state = await options.pipelineState.get(startupId);
  if (!state) {
    logger.warn(`[${options.phase}] SKIPPED — no pipeline state found | Startup: ${startupId}`);
    return {
      startupId,
      pipelineRunId,
      userId,
      result: null,
    };
  }

  if (
    state.pipelineRunId !== pipelineRunId ||
    state.status !== PipelineStatus.RUNNING
  ) {
    logger.warn(
      `[${options.phase}] SKIPPED — stale state | Expected run: ${pipelineRunId}, got: ${state.pipelineRunId} | Status: ${state.status}`,
    );
    return {
      startupId,
      pipelineRunId,
      userId,
      result: (state.results[options.phase] as PhaseResultMap[P] | undefined) ?? null,
    };
  }

  if (jobRetryCount < (state.retryCounts[options.phase] ?? 0)) {
    logger.warn(
      `[${options.phase}] SKIPPED — stale retry attempt | Startup: ${startupId} | Job retry: ${jobRetryCount} | Current retry: ${state.retryCounts[options.phase] ?? 0}`,
    );
    return {
      startupId,
      pipelineRunId,
      userId,
      result: (state.results[options.phase] as PhaseResultMap[P] | undefined) ?? null,
    };
  }

  const phaseStatus = state.phases[options.phase].status;
  if (
    phaseStatus === PhaseStatus.COMPLETED ||
    phaseStatus === PhaseStatus.FAILED ||
    phaseStatus === PhaseStatus.SKIPPED
  ) {
    logger.log(`[${options.phase}] SKIPPED — already ${phaseStatus} | Startup: ${startupId}`);
    return {
      startupId,
      pipelineRunId,
      userId,
      result: (state.results[options.phase] as PhaseResultMap[P] | undefined) ?? null,
    };
  }

  try {
    await options.pipelineState.updatePhase(
      startupId,
      options.phase,
      PhaseStatus.RUNNING,
    );
    await options.pipelineService.onPhaseStarted?.(startupId, options.phase);
    options.notificationGateway.sendJobStatus(userId, {
      jobId: String(options.job.id),
      jobType: options.jobType,
      status: "processing",
      startupId,
      pipelineRunId,
    });

    logger.log(`[${options.phase}] Executing phase logic... | Startup: ${startupId}`);
    const result = await options.run();

    const latestState = await options.pipelineState.get(startupId);
    if (!latestState) {
      logger.warn(
        `[${options.phase}] SKIPPED — pipeline state missing after execution | Startup: ${startupId}`,
      );
      return {
        startupId,
        pipelineRunId,
        userId,
        result: null,
      };
    }

    if (
      latestState.pipelineRunId !== pipelineRunId ||
      latestState.status !== PipelineStatus.RUNNING ||
      jobRetryCount < (latestState.retryCounts[options.phase] ?? 0)
    ) {
      logger.warn(
        `[${options.phase}] SKIPPED — stale completion ignored | Startup: ${startupId} | Job retry: ${jobRetryCount} | Current retry: ${latestState.retryCounts[options.phase] ?? 0} | State run: ${latestState.pipelineRunId} | State status: ${latestState.status}`,
      );
      return {
        startupId,
        pipelineRunId,
        userId,
        result: (latestState.results[options.phase] as PhaseResultMap[P] | undefined) ?? null,
      };
    }

    await options.pipelineState.setPhaseResult(startupId, options.phase, result);
    await options.pipelineState.updatePhase(
      startupId,
      options.phase,
      PhaseStatus.COMPLETED,
    );
    await options.pipelineService.onPhaseCompleted(startupId, options.phase);

    options.notificationGateway.sendJobStatus(userId, {
      jobId: String(options.job.id),
      jobType: options.jobType,
      status: "completed",
      startupId,
      pipelineRunId,
      result,
    });

    return {
      startupId,
      pipelineRunId,
      userId,
      result,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await options.pipelineState.updatePhase(
      startupId,
      options.phase,
      PhaseStatus.FAILED,
      message,
    );
    await options.pipelineService.onPhaseFailed(startupId, options.phase, message);
    options.notificationGateway.sendJobStatus(userId, {
      jobId: String(options.job.id),
      jobType: options.jobType,
      status: "failed",
      startupId,
      pipelineRunId,
      error: message,
    });
    throw error;
  }
}

function readJobRetryCount(
  job: Job<{ startupId: string; pipelineRunId: string; userId: string }>,
): number {
  const retryCount = (job.data as { metadata?: { retryCount?: unknown } }).metadata?.retryCount;
  if (typeof retryCount === "number" && Number.isFinite(retryCount) && retryCount >= 0) {
    return Math.floor(retryCount);
  }
  return 0;
}
