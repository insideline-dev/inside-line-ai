import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { Job } from "bullmq";
import {
  TaskProcessor,
  type TaskJobHandlerResult,
} from "../../queue/processors/task.processor";
import type { TaskJobData } from "../../queue/interfaces/job-data.interface";
import { NotificationGateway } from "../../notification/notification.gateway";
import { CalibrationRecomputeService } from "./calibration-recompute.service";
import {
  CALIBRATION_RECOMPUTE_JOB,
  type CalibrationRecomputeJobPayload,
} from "./calibration-recompute.constants";

/**
 * DS-E11-F4-S1 — runs `CalibrationRecomputeService.runJob` for queued
 * calibration recompute work and emits the WS event that refreshes the
 * admin Investors page.
 *
 * Registered on the shared TASK queue (one worker, name-based routing)
 * because the recompute is fast (read a couple of dozen rows, run an
 * in-memory aggregation, upsert one row) and doesn't deserve its own
 * worker pool.
 */
@Injectable()
export class CalibrationRecomputeProcessor implements OnModuleInit {
  private readonly logger = new Logger(CalibrationRecomputeProcessor.name);

  constructor(
    private readonly taskProcessor: TaskProcessor,
    private readonly recomputeService: CalibrationRecomputeService,
    private readonly notifications: NotificationGateway,
  ) {}

  onModuleInit(): void {
    this.taskProcessor.registerHandler(
      CALIBRATION_RECOMPUTE_JOB,
      (job) => this.handle(job),
    );
  }

  async handle(job: Job<TaskJobData>): Promise<TaskJobHandlerResult> {
    const payload = this.extractPayload(job.data);
    const jobId = job.id ?? `local:${Date.now()}`;
    this.logger.log(
      `Running calibration recompute for investor ${payload.investorId} (job ${jobId})`,
    );

    try {
      const { summary, computedAt } = await this.recomputeService.runJob(
        payload.investorId,
        jobId,
      );

      this.notifications.sendInvestorEvent(
        payload.investorId,
        "investor.calibration.recompute.completed",
        {
          investorId: payload.investorId,
          jobId,
          computedAt: computedAt.toISOString(),
        },
      );

      return {
        type: "task",
        result: {
          taskName: CALIBRATION_RECOMPUTE_JOB,
          investorId: payload.investorId,
          computedAt: computedAt.toISOString(),
          decisionsWithTriage: summary.decisionsWithTriage,
          totalDecisions: summary.totalDecisions,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.notifications.sendInvestorEvent(
        payload.investorId,
        "investor.calibration.recompute.failed",
        { investorId: payload.investorId, jobId, error: message },
      );
      throw error;
    }
  }

  private extractPayload(data: TaskJobData): CalibrationRecomputeJobPayload {
    const investorId = (data.payload as { investorId?: unknown } | undefined)
      ?.investorId;
    if (typeof investorId !== "string" || investorId.length === 0) {
      throw new Error(
        "invalid calibration recompute payload: missing investorId",
      );
    }
    return { investorId };
  }
}
