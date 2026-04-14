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

  protected override async onWorkerStalled(
    job: Job<AiEvaluationJobData>,
  ): Promise<void> {
    const { startupId, pipelineRunId, userId } = job.data;
    await this.pipelineService.recordInfrastructureIssue({
      startupId,
      pipelineRunId,
      userId,
      phase: PipelinePhase.EVALUATION,
      stepKey: "worker_stalled",
      error: `BullMQ worker marked evaluation job ${job.id} as stalled`,
      failureSource: "worker_stalled",
      meta: {
        queueName: QUEUE_NAMES.AI_EVALUATION,
        jobId: String(job.id),
        jobType: job.data.type,
      },
    });
  }

  protected async process(
    job: Job<AiEvaluationJobData>,
  ): Promise<Omit<AiEvaluationJobResult, "jobId" | "duration" | "success">> {
    const { startupId, pipelineRunId, userId } = job.data;
    const agentRetryKeys = this.readAgentRetryKeys(job.data.metadata);
    const agentKey = agentRetryKeys?.[0];
    const phaseRetryCount = this.readPhaseRetryCount(job.data.metadata);
    const agentAttemptIds = new Map<EvaluationAgentKey, string>();
    const agentAttemptNumbers = new Map<EvaluationAgentKey, number>();

    this.logger.log(
      `[EvalProcessor] Job ${job.id} | agentRetryKeys=${agentRetryKeys ? `[${agentRetryKeys.join(", ")}]` : "none (full run)"} | metadata.agentKeys=${JSON.stringify(job.data.metadata?.agentKeys)} | metadata.agentKey=${job.data.metadata?.agentKey} | Startup: ${startupId}`,
    );

    if (job.data.type !== "ai_evaluation") {
      throw new Error("Invalid job type for evaluation processor");
    }

    // Evaluation phase can run for 2+ hours — extend BullMQ lock every 10 min
    // to prevent the job from being marked stalled due to missed auto-renewals.
    const HEARTBEAT_MS = 10 * 60 * 1000;
    const LOCK_DURATION_MS = 15 * 60 * 1000;
    const heartbeat = setInterval(() => {
      job.extendLock(job.token!, LOCK_DURATION_MS).catch((err: unknown) => {
        this.logger.warn(
          `[EvalProcessor] Failed to extend job lock: ${err instanceof Error ? err.message : String(err)}`,
        );
      });
    }, HEARTBEAT_MS);

    let runResult: Awaited<ReturnType<typeof runPipelinePhase>>;
    try {
      runResult = await runPipelinePhase({
      job,
      phase: PipelinePhase.EVALUATION,
      jobType: "ai_evaluation",
      pipelineState: this.pipelineState,
      pipelineService: this.pipelineService,
      notificationGateway: this.notificationGateway,
      run: () =>
        this.evaluationService.run(startupId, {
          agentKey,
          agentKeys: agentRetryKeys,
          onAgentStart: (agent) => {
            const attemptId = this.buildAgentAttemptId(
              pipelineRunId,
              PipelinePhase.EVALUATION,
              agent,
              phaseRetryCount,
              1,
            );
            agentAttemptIds.set(agent, attemptId);
            agentAttemptNumbers.set(agent, 1);
            this.pipelineService
              .onAgentProgress({
                startupId,
                userId,
                pipelineRunId,
                phase: PipelinePhase.EVALUATION,
                key: agent,
                status: "running",
                progress: 0,
                phaseRetryCount,
                agentAttemptId: attemptId,
                attempt: 1,
                retryCount: 0,
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
            dataSummary,
            attempt,
            retryCount,
            error,
            fallbackReason,
            rawProviderError,
            meta,
          }) => {
            const resolvedAttempt = Math.max(
              1,
              attempt ?? agentAttemptNumbers.get(agent) ?? 1,
            );
            const resolvedRetryCount = Math.max(
              0,
              retryCount ?? resolvedAttempt - 1,
            );
            agentAttemptNumbers.set(agent, resolvedAttempt);
            const attemptId =
              agentAttemptIds.get(agent) ??
              this.buildAgentAttemptId(
                pipelineRunId,
                PipelinePhase.EVALUATION,
                agent,
                phaseRetryCount,
                resolvedAttempt,
              );
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
                attempt: resolvedAttempt,
                retryCount: resolvedRetryCount,
                phaseRetryCount,
                agentAttemptId: attemptId,
                error: error,
                usedFallback,
                fallbackReason,
                rawProviderError,
                ...(dataSummary ? { dataSummary } : {}),
                ...(meta ? { meta } : {}),
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
                attempt: resolvedAttempt,
                retryCount: resolvedRetryCount,
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
            const resolvedAttempt = Math.max(1, attempt ?? 1);
            const resolvedRetryCount = Math.max(0, retryCount ?? 0);
            const attemptId = this.buildAgentAttemptId(
              pipelineRunId,
              PipelinePhase.EVALUATION,
              agent,
              phaseRetryCount,
              resolvedAttempt,
            );
            agentAttemptIds.set(agent, attemptId);
            agentAttemptNumbers.set(agent, resolvedAttempt);

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
                attempt: resolvedAttempt,
                retryCount: resolvedRetryCount,
                phaseRetryCount,
                agentAttemptId: attemptId,
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
    } finally {
      clearInterval(heartbeat);
    }

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
    const keys = this.readAgentRetryKeys(metadata);
    return keys?.[0];
  }

  private readAgentRetryKeys(
    metadata: Record<string, unknown> | undefined,
  ): EvaluationAgentKey[] | undefined {
    if (!metadata || metadata.mode !== "agent_retry") {
      return undefined;
    }

    const isValidKey = (k: unknown): k is EvaluationAgentKey =>
      k === "team" ||
      k === "market" ||
      k === "product" ||
      k === "traction" ||
      k === "businessModel" ||
      k === "gtm" ||
      k === "financials" ||
      k === "competitiveAdvantage" ||
      k === "legal" ||
      k === "dealTerms" ||
      k === "exitPotential";

    if (Array.isArray(metadata.agentKeys)) {
      const valid = metadata.agentKeys.filter(isValidKey);
      if (valid.length > 0) return valid;
    }

    if (isValidKey(metadata.agentKey)) {
      return [metadata.agentKey];
    }

    return undefined;
  }

  private readPhaseRetryCount(
    metadata: Record<string, unknown> | undefined,
  ): number {
    const retryCount = metadata?.retryCount;
    if (
      typeof retryCount === "number" &&
      Number.isFinite(retryCount) &&
      retryCount >= 0
    ) {
      return Math.floor(retryCount);
    }
    return 0;
  }

  private buildAgentAttemptId(
    pipelineRunId: string,
    phase: PipelinePhase,
    agent: string,
    phaseRetryCount: number,
    attempt: number,
  ): string {
    return `${pipelineRunId}:${phase}:${agent}:phase-${phaseRetryCount}:attempt-${attempt}`;
  }
}
