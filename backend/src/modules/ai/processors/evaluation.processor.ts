import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Job } from "bullmq";
import {
  AiEvaluationJobData,
  AiEvaluationJobResult,
} from "../../../queue/interfaces";
import { QUEUE_CONCURRENCY, QUEUE_NAMES } from "../../../queue";
import {
  BaseProcessor,
  parseRedisUrl,
} from "../../../queue/processors/base.processor";
import { NotificationGateway } from "../../../notification/notification.gateway";
import type { EvaluationAgentKey } from "../interfaces/agent.interface";
import { PipelinePhase } from "../interfaces/pipeline.interface";
import { EvaluationService } from "../services/evaluation.service";
import { PipelineStateService } from "../services/pipeline-state.service";
import { PipelineService } from "../services/pipeline.service";
import { runPipelinePhase } from "./run-phase.util";

@Injectable()
export class EvaluationProcessor
  extends BaseProcessor<AiEvaluationJobData, AiEvaluationJobResult>
  implements OnModuleInit, OnModuleDestroy
{
  protected readonly logger = new Logger(EvaluationProcessor.name);

  constructor(
    config: ConfigService,
    private evaluationService: EvaluationService,
    private pipelineState: PipelineStateService,
    private pipelineService: PipelineService,
    private notificationGateway: NotificationGateway,
  ) {
    const redisUrl = config.get<string>("REDIS_URL", "redis://localhost:6379");
    const queuePrefix = config.get<string>("QUEUE_PREFIX");
    super(
      QUEUE_NAMES.AI_EVALUATION,
      parseRedisUrl(redisUrl),
      QUEUE_CONCURRENCY[QUEUE_NAMES.AI_EVALUATION],
      queuePrefix,
    );
  }

  async onModuleInit() {
    await this.initialize();
    if (!this.worker) {
      this.logger.warn(
        "EvaluationProcessor initialized without an active worker; recovery will retry automatically.",
      );
      return;
    }
    this.logger.log(`✅ EvaluationProcessor ready | Queue: ${QUEUE_NAMES.AI_EVALUATION} | Concurrency: ${QUEUE_CONCURRENCY[QUEUE_NAMES.AI_EVALUATION]}`);
  }

  async onModuleDestroy() {
    await this.close();
  }

  protected async process(
    job: Job<AiEvaluationJobData>,
  ): Promise<Omit<AiEvaluationJobResult, "jobId" | "duration" | "success">> {
    const { startupId, pipelineRunId, userId } = job.data;
    const agentKey = this.readAgentRetryKey(job.data.metadata);

    if (job.data.type !== "ai_evaluation") {
      throw new Error("Invalid job type for evaluation processor");
    }

    const runResult = await runPipelinePhase({
      job,
      phase: PipelinePhase.EVALUATION,
      jobType: "ai_evaluation",
      pipelineState: this.pipelineState,
      pipelineService: this.pipelineService,
      notificationGateway: this.notificationGateway,
      run: () =>
        this.evaluationService.run(startupId, {
          agentKey,
          onAgentStart: (agent) => {
            this.pipelineService
              .onAgentProgress({
                startupId,
                userId,
                pipelineRunId,
                phase: PipelinePhase.EVALUATION,
                key: agent,
                status: "running",
                progress: 0,
              })
              .catch((progressError) => {
                this.logger.warn(
                  `Failed to mark evaluation agent running for ${agent}: ${
                    progressError instanceof Error
                      ? progressError.message
                      : String(progressError)
                  }`,
                );
              });
          },
          onAgentComplete: ({
            agent,
            output,
            usedFallback,
            error,
            fallbackReason,
            rawProviderError,
          }) => {
            const isFailed = Boolean(error) && usedFallback !== true;
            this.pipelineService
              .onAgentProgress({
                startupId,
                userId,
                pipelineRunId,
                phase: PipelinePhase.EVALUATION,
                key: agent,
                status: isFailed ? "failed" : "completed",
                progress: isFailed ? 0 : 100,
                error: error,
                usedFallback,
                fallbackReason,
                rawProviderError,
                lifecycleEvent: usedFallback
                  ? "fallback"
                  : isFailed
                    ? "failed"
                    : "completed",
              })
              .catch((progressError) => {
                this.logger.warn(
                  `Failed to update evaluation agent progress for ${agent}: ${
                    progressError instanceof Error
                      ? progressError.message
                      : String(progressError)
                  }`,
                );
              });
            this.notificationGateway.sendJobStatus(userId, {
              jobId: String(job.id),
              jobType: "ai_evaluation",
              status: "processing",
              startupId,
              pipelineRunId,
              result: {
                agent,
                output,
                usedFallback,
                error,
                fallbackReason,
                rawProviderError,
              },
            });
          },
          onAgentLifecycle: ({
            agent,
            event,
            attempt,
            retryCount,
            error,
            fallbackReason,
            rawProviderError,
          }) => {
            if (event !== "retrying") {
              return;
            }

            this.pipelineService
              .onAgentProgress({
                startupId,
                userId,
                pipelineRunId,
                phase: PipelinePhase.EVALUATION,
                key: agent,
                status: "running",
                progress: 0,
                error,
                fallbackReason,
                rawProviderError,
                lifecycleEvent: event,
                attempt,
                retryCount,
              })
              .catch((progressError) => {
                this.logger.warn(
                  `Failed to update evaluation retry telemetry for ${agent}: ${
                    progressError instanceof Error
                      ? progressError.message
                      : String(progressError)
                  }`,
                );
              });
          },
        }),
    });

    return {
      type: "ai_evaluation",
      startupId: runResult.startupId,
      pipelineRunId: runResult.pipelineRunId,
      data: runResult.result,
    };
  }

  private readAgentRetryKey(
    metadata: Record<string, unknown> | undefined,
  ): EvaluationAgentKey | undefined {
    if (!metadata || metadata.mode !== "agent_retry") {
      return undefined;
    }

    const agentKey = metadata.agentKey;
    if (
      agentKey === "team" ||
      agentKey === "market" ||
      agentKey === "product" ||
      agentKey === "traction" ||
      agentKey === "businessModel" ||
      agentKey === "gtm" ||
      agentKey === "financials" ||
      agentKey === "competitiveAdvantage" ||
      agentKey === "legal" ||
      agentKey === "dealTerms" ||
      agentKey === "exitPotential"
    ) {
      return agentKey;
    }

    return undefined;
  }
}
