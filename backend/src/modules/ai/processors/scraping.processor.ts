import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Job } from "bullmq";
import {
  AiScrapingJobData,
  AiScrapingJobResult,
} from "../../../queue/interfaces";
import { QUEUE_CONCURRENCY, QUEUE_NAMES } from "../../../queue";
import {
  BaseProcessor,
  parseRedisUrl,
} from "../../../queue/processors/base.processor";
import { NotificationGateway } from "../../../notification/notification.gateway";
import type { PhaseProgressCallback } from "../interfaces/progress-callback.interface";
import { PipelinePhase } from "../interfaces/pipeline.interface";
import { PipelineAgentTraceService } from "../services/pipeline-agent-trace.service";
import { PipelineStateService } from "../services/pipeline-state.service";
import { PipelineService } from "../services/pipeline.service";
import { ScrapingService } from "../services/scraping.service";
import { runPipelinePhase } from "./run-phase.util";

@Injectable()
export class ScrapingProcessor
  extends BaseProcessor<AiScrapingJobData, AiScrapingJobResult>
  implements OnModuleInit, OnModuleDestroy
{
  protected readonly logger = new Logger(ScrapingProcessor.name);

  constructor(
    config: ConfigService,
    private scrapingService: ScrapingService,
    private pipelineState: PipelineStateService,
    private pipelineService: PipelineService,
    private notificationGateway: NotificationGateway,
    private pipelineAgentTrace: PipelineAgentTraceService,
  ) {
    const redisUrl = config.get<string>("REDIS_URL", "redis://localhost:6379");
    const queuePrefix = config.get<string>("QUEUE_PREFIX");
    super(
      QUEUE_NAMES.AI_SCRAPING,
      parseRedisUrl(redisUrl),
      QUEUE_CONCURRENCY[QUEUE_NAMES.AI_SCRAPING],
      queuePrefix,
    );
  }

  async onModuleInit() {
    await this.initialize();
    if (!this.worker) {
      this.logger.warn(
        "ScrapingProcessor initialized without an active worker; recovery will retry automatically.",
      );
      return;
    }
    this.logger.log(`✅ ScrapingProcessor ready | Queue: ${QUEUE_NAMES.AI_SCRAPING} | Concurrency: ${QUEUE_CONCURRENCY[QUEUE_NAMES.AI_SCRAPING]}`);
  }

  async onModuleDestroy() {
    await this.close();
  }

  protected override async onWorkerStalled(
    job: Job<AiScrapingJobData>,
  ): Promise<void> {
    const { startupId, pipelineRunId, userId } = job.data;
    await this.pipelineService.recordInfrastructureIssue({
      startupId,
      pipelineRunId,
      userId,
      phase: PipelinePhase.SCRAPING,
      stepKey: "worker_stalled",
      error: `BullMQ worker marked scraping job ${job.id} as stalled`,
      failureSource: "worker_stalled",
      meta: {
        queueName: QUEUE_NAMES.AI_SCRAPING,
        jobId: String(job.id),
        jobType: job.data.type,
      },
    });
  }

  protected async process(
    job: Job<AiScrapingJobData>,
  ): Promise<Omit<AiScrapingJobResult, "jobId" | "duration" | "success">> {
    const { startupId, userId, pipelineRunId } = job.data;

    if (job.data.type !== "ai_scraping") {
      throw new Error("Invalid job type for scraping processor");
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
          phase: PipelinePhase.SCRAPING,
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
            `Failed to persist scraping step trace for ${stepKey}: ${
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
            phase: PipelinePhase.SCRAPING,
            key: stepKey,
            status: "running",
            progress: 0,
            lifecycleEvent: "started",
          })
          .catch((progressError) => {
            this.logger.warn(
              `Failed to mark scraping sub-step running for ${stepKey}: ${
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
            phase: PipelinePhase.SCRAPING,
            key: stepKey,
            status: "completed",
            progress: 100,
            lifecycleEvent: "completed",
            dataSummary: payload?.summary,
          })
          .catch((progressError) => {
            this.logger.warn(
              `Failed to mark scraping sub-step completed for ${stepKey}: ${
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
            phase: PipelinePhase.SCRAPING,
            key: stepKey,
            status: "failed",
            progress: 0,
            error,
            lifecycleEvent: "failed",
          })
          .catch((progressError) => {
            this.logger.warn(
              `Failed to mark scraping sub-step failed for ${stepKey}: ${
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
      phase: PipelinePhase.SCRAPING,
      jobType: "ai_scraping",
      pipelineState: this.pipelineState,
      pipelineService: this.pipelineService,
      notificationGateway: this.notificationGateway,
      run: () =>
        this.scrapingService.run(startupId, {
          onStepProgress,
          onAgentStart: (agentKey) => {
            this.pipelineService
              .onAgentProgress({
                startupId,
                userId,
                pipelineRunId,
                phase: PipelinePhase.SCRAPING,
                key: agentKey,
                status: "running",
                progress: 0,
                attempt: 1,
                retryCount: 0,
                lifecycleEvent: "started",
              })
              .catch((progressError) => {
                this.logger.warn(
                  `Failed to mark scraping agent running for ${agentKey}: ${
                    progressError instanceof Error
                      ? progressError.message
                      : String(progressError)
                  }`,
                );
              });
          },
          onAgentComplete: ({
            agentKey,
            status,
            error,
            inputPrompt,
            outputJson,
            outputText,
            meta,
            attempt,
            retryCount,
          }) => {
            const resolvedAttempt = Math.max(1, attempt ?? 1);
            const resolvedRetryCount = Math.max(
              0,
              retryCount ?? resolvedAttempt - 1,
            );
            const isFailed = status === "failed";

            this.pipelineService
              .onAgentProgress({
                startupId,
                userId,
                pipelineRunId,
                phase: PipelinePhase.SCRAPING,
                key: agentKey,
                status: isFailed ? "failed" : "completed",
                progress: isFailed ? 0 : 100,
                error,
                attempt: resolvedAttempt,
                retryCount: resolvedRetryCount,
                lifecycleEvent: isFailed ? "failed" : "completed",
                ...(meta && Object.keys(meta).length > 0
                  ? { dataSummary: meta, meta }
                  : {}),
              })
              .catch((progressError) => {
                this.logger.warn(
                  `Failed to update scraping agent progress for ${agentKey}: ${
                    progressError instanceof Error
                      ? progressError.message
                      : String(progressError)
                  }`,
                );
              });

            this.pipelineAgentTrace
              .recordRun({
                startupId,
                pipelineRunId,
                phase: PipelinePhase.SCRAPING,
                agentKey,
                status: isFailed ? "failed" : "completed",
                error,
                inputPrompt,
                outputJson,
                outputText,
                meta,
                attempt: resolvedAttempt,
                retryCount: resolvedRetryCount,
              })
              .catch((traceError) => {
                this.logger.warn(
                  `Failed to persist scraping trace for ${agentKey}: ${
                    traceError instanceof Error
                      ? traceError.message
                      : String(traceError)
                  }`,
                );
              });
          },
        }),
    });

    return {
      type: "ai_scraping",
      startupId: runResult.startupId,
      pipelineRunId: runResult.pipelineRunId,
      data: runResult.result,
    };
  }
}
