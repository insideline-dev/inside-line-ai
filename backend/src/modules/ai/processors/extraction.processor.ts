import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Job } from "bullmq";
import {
  AiExtractionJobData,
  AiExtractionJobResult,
} from "../../../queue/interfaces";
import { QUEUE_CONCURRENCY, QUEUE_NAMES } from "../../../queue";
import {
  BaseProcessor,
  parseRedisUrl,
} from "../../../queue/processors/base.processor";
import { NotificationGateway } from "../../../notification/notification.gateway";
import type { PhaseProgressCallback } from "../interfaces/progress-callback.interface";
import { PipelinePhase } from "../interfaces/pipeline.interface";
import { ExtractionService } from "../services/extraction.service";
import { PipelineAgentTraceService } from "../services/pipeline-agent-trace.service";
import { PipelineStateService } from "../services/pipeline-state.service";
import { PipelineService } from "../services/pipeline.service";
import { runPipelinePhase } from "./run-phase.util";

@Injectable()
export class ExtractionProcessor
  extends BaseProcessor<AiExtractionJobData, AiExtractionJobResult>
  implements OnModuleInit, OnModuleDestroy
{
  protected readonly logger = new Logger(ExtractionProcessor.name);

  constructor(
    config: ConfigService,
    private extractionService: ExtractionService,
    private pipelineState: PipelineStateService,
    private pipelineService: PipelineService,
    private notificationGateway: NotificationGateway,
    private pipelineAgentTrace: PipelineAgentTraceService,
  ) {
    const redisUrl = config.get<string>("REDIS_URL", "redis://localhost:6379");
    const queuePrefix = config.get<string>("QUEUE_PREFIX");
    super(
      QUEUE_NAMES.AI_EXTRACTION,
      parseRedisUrl(redisUrl),
      QUEUE_CONCURRENCY[QUEUE_NAMES.AI_EXTRACTION],
      queuePrefix,
    );
  }

  async onModuleInit() {
    await this.initialize();
    if (!this.worker) {
      this.logger.warn(
        "ExtractionProcessor initialized without an active worker; recovery will retry automatically.",
      );
      return;
    }
    this.logger.log(`✅ ExtractionProcessor ready | Queue: ${QUEUE_NAMES.AI_EXTRACTION} | Concurrency: ${QUEUE_CONCURRENCY[QUEUE_NAMES.AI_EXTRACTION]}`);
  }

  async onModuleDestroy() {
    await this.close();
  }

  protected override async onWorkerStalled(
    job: Job<AiExtractionJobData>,
  ): Promise<void> {
    const { startupId, pipelineRunId, userId } = job.data;
    await this.pipelineService.recordInfrastructureIssue({
      startupId,
      pipelineRunId,
      userId,
      phase: PipelinePhase.EXTRACTION,
      stepKey: "worker_stalled",
      error: `BullMQ worker marked extraction job ${job.id} as stalled`,
      failureSource: "worker_stalled",
      meta: {
        queueName: QUEUE_NAMES.AI_EXTRACTION,
        jobId: String(job.id),
        jobType: job.data.type,
      },
    });
  }

  protected async process(
    job: Job<AiExtractionJobData>,
  ): Promise<Omit<AiExtractionJobResult, "jobId" | "duration" | "success">> {
    const { startupId, userId, pipelineRunId } = job.data;

    if (job.data.type !== "ai_extraction") {
      throw new Error("Invalid job type for extraction processor");
    }

    const recordStepTrace = (
      stepKey: string,
      status: "running" | "completed" | "failed",
      payload?: {
        inputJson?: unknown;
        outputJson?: unknown;
        inputText?: string;
        outputText?: string;
        meta?: Record<string, unknown>;
        error?: string;
      },
    ) => {
      void this.pipelineAgentTrace
        .recordRun({
          startupId,
          pipelineRunId,
          phase: PipelinePhase.EXTRACTION,
          agentKey: stepKey,
          traceKind: "phase_step",
          stepKey,
          status,
          inputText: payload?.inputText,
          outputText: payload?.outputText,
          inputJson: payload?.inputJson,
          outputJson: payload?.outputJson,
          meta: payload?.meta,
          error: payload?.error,
        })
        .catch((traceError) => {
          this.logger.warn(
            `Failed to persist extraction step trace for ${stepKey}: ${
              traceError instanceof Error ? traceError.message : String(traceError)
            }`,
          );
        });
    };

    const onStepProgress: PhaseProgressCallback = {
      onStepStart: (stepKey, trace) => {
        recordStepTrace(stepKey, "running", trace);
        void this.pipelineService
          .onAgentProgress({
            startupId,
            userId,
            pipelineRunId,
            phase: PipelinePhase.EXTRACTION,
            key: stepKey,
            status: "running",
            progress: 0,
            lifecycleEvent: "started",
          })
          .catch((progressError) => {
            this.logger.warn(
              `Failed to mark extraction sub-step running for ${stepKey}: ${
                progressError instanceof Error
                  ? progressError.message
                  : String(progressError)
              }`,
            );
          });
      },
      onStepComplete: (stepKey, payload) => {
        recordStepTrace(stepKey, "completed", payload);
        void this.pipelineService
          .onAgentProgress({
            startupId,
            userId,
            pipelineRunId,
            phase: PipelinePhase.EXTRACTION,
            key: stepKey,
            status: "completed",
            progress: 100,
            lifecycleEvent: "completed",
            dataSummary: payload?.summary,
          })
          .catch((progressError) => {
            this.logger.warn(
              `Failed to mark extraction sub-step completed for ${stepKey}: ${
                progressError instanceof Error
                  ? progressError.message
                  : String(progressError)
              }`,
            );
          });
      },
      onStepFailed: (stepKey, error, trace) => {
        recordStepTrace(stepKey, "failed", {
          ...trace,
          error,
        });
        void this.pipelineService
          .onAgentProgress({
            startupId,
            userId,
            pipelineRunId,
            phase: PipelinePhase.EXTRACTION,
            key: stepKey,
            status: "failed",
            progress: 0,
            error,
            lifecycleEvent: "failed",
          })
          .catch((progressError) => {
            this.logger.warn(
              `Failed to mark extraction sub-step failed for ${stepKey}: ${
                progressError instanceof Error
                  ? progressError.message
                  : String(progressError)
              }`,
            );
          });
      },
      onStepTrace: (stepKey, status, payload) => {
        recordStepTrace(stepKey, status, payload);
      },
    };

    const runResult = await runPipelinePhase({
      job,
      phase: PipelinePhase.EXTRACTION,
      jobType: "ai_extraction",
      pipelineState: this.pipelineState,
      pipelineService: this.pipelineService,
      notificationGateway: this.notificationGateway,
      run: () => this.extractionService.run(startupId, onStepProgress),
    });

    return {
      type: "ai_extraction",
      startupId: runResult.startupId,
      pipelineRunId: runResult.pipelineRunId,
      data: runResult.result,
    };
  }
}
