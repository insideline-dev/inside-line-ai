import type { Job } from "bullmq";
import { PhaseStatus, PipelinePhase } from "../interfaces/pipeline.interface";
import type { PhaseResultMap } from "../interfaces/pipeline.interface";
import type { PipelineStateService } from "../services/pipeline-state.service";
import type { PipelineService } from "../services/pipeline.service";
import type { NotificationGateway } from "../../../notification/notification.gateway";
import type { JobType } from "../../../notification/dto/job-status-event.dto";

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
  result: PhaseResultMap[P];
}> {
  const { startupId, pipelineRunId, userId } = options.job.data;

  try {
    await options.pipelineState.updatePhase(
      startupId,
      options.phase,
      PhaseStatus.RUNNING,
    );
    options.notificationGateway.sendJobStatus(userId, {
      jobId: String(options.job.id),
      jobType: options.jobType,
      status: "processing",
      startupId,
      pipelineRunId,
    });

    const result = await options.run();

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
