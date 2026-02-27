import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Job } from "bullmq";
import {
  AiResearchJobData,
  AiResearchJobResult,
} from "../../../queue/interfaces";
import { QUEUE_CONCURRENCY, QUEUE_NAMES } from "../../../queue";
import {
  BaseProcessor,
  parseRedisUrl,
} from "../../../queue/processors/base.processor";
import { NotificationGateway } from "../../../notification/notification.gateway";
import type { ResearchAgentKey } from "../interfaces/agent.interface";
import { PipelinePhase } from "../interfaces/pipeline.interface";
import { PipelineStateService } from "../services/pipeline-state.service";
import { PipelineService } from "../services/pipeline.service";
import { ResearchService } from "../services/research.service";
import { runPipelinePhase } from "./run-phase.util";

@Injectable()
export class ResearchProcessor
  extends BaseProcessor<AiResearchJobData, AiResearchJobResult>
  implements OnModuleInit, OnModuleDestroy
{
  protected readonly logger = new Logger(ResearchProcessor.name);

  constructor(
    config: ConfigService,
    private researchService: ResearchService,
    private pipelineState: PipelineStateService,
    private pipelineService: PipelineService,
    private notificationGateway: NotificationGateway,
  ) {
    const redisUrl = config.get<string>("REDIS_URL", "redis://localhost:6379");
    const queuePrefix = config.get<string>("QUEUE_PREFIX");
    super(
      QUEUE_NAMES.AI_RESEARCH,
      parseRedisUrl(redisUrl),
      QUEUE_CONCURRENCY[QUEUE_NAMES.AI_RESEARCH],
      queuePrefix,
    );
  }

  async onModuleInit() {
    await this.initialize();
    if (!this.worker) {
      this.logger.warn(
        "ResearchProcessor initialized without an active worker; recovery will retry automatically.",
      );
      return;
    }
    this.logger.log(`✅ ResearchProcessor ready | Queue: ${QUEUE_NAMES.AI_RESEARCH} | Concurrency: ${QUEUE_CONCURRENCY[QUEUE_NAMES.AI_RESEARCH]}`);
  }

  async onModuleDestroy() {
    await this.close();
  }

  protected async process(
    job: Job<AiResearchJobData>,
  ): Promise<Omit<AiResearchJobResult, "jobId" | "duration" | "success">> {
    const { startupId, pipelineRunId, userId } = job.data;
    const agentKey = this.readAgentRetryKey(job.data.metadata);
    const phaseRetryCount = this.readPhaseRetryCount(job.data.metadata);
    const agentAttemptIds = new Map<ResearchAgentKey, string>();

    if (job.data.type !== "ai_research") {
      throw new Error("Invalid job type for research processor");
    }

    const runResult = await runPipelinePhase({
      job,
      phase: PipelinePhase.RESEARCH,
      jobType: "ai_research",
      pipelineState: this.pipelineState,
      pipelineService: this.pipelineService,
      notificationGateway: this.notificationGateway,
      run: () =>
        this.researchService.run(
          startupId,
          {
            ...(agentKey ? { agentKey } : {}),
            phaseRetryCount,
            onAgentStart: (agent) => {
              const attemptId = this.buildAgentAttemptId(
                pipelineRunId,
                PipelinePhase.RESEARCH,
                agent,
                phaseRetryCount,
                1,
              );
              agentAttemptIds.set(agent, attemptId);
              this.pipelineService
                .onAgentProgress({
                  startupId,
                  userId,
                  pipelineRunId,
                  phase: PipelinePhase.RESEARCH,
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
                    `Failed to mark research agent running for ${agent}: ${
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
              error,
              fallbackReason,
              rawProviderError,
              rejected,
              attempt,
              retryCount,
            }) => {
              const resolvedAttempt = Math.max(1, attempt ?? 1);
              const resolvedRetryCount = Math.max(
                0,
                retryCount ?? resolvedAttempt - 1,
              );
              const attemptId =
                agentAttemptIds.get(agent) ??
                this.buildAgentAttemptId(
                  pipelineRunId,
                  PipelinePhase.RESEARCH,
                  agent,
                  phaseRetryCount,
                  resolvedAttempt,
                );
              const isFailed =
                (rejected && !usedFallback) ||
                (Boolean(error) && !usedFallback);
              const lifecycleEvent = usedFallback
                ? "fallback"
                : isFailed
                  ? "failed"
                  : "completed";
              this.pipelineService
                .onAgentProgress({
                  startupId,
                  userId,
                  pipelineRunId,
                  phase: PipelinePhase.RESEARCH,
                  key: agent,
                  status: isFailed ? "failed" : "completed",
                  progress: isFailed ? 0 : 100,
                  error,
                  attempt: resolvedAttempt,
                  retryCount: resolvedRetryCount,
                  phaseRetryCount,
                  agentAttemptId: attemptId,
                  usedFallback,
                  fallbackReason,
                  rawProviderError,
                  ...(dataSummary ? { dataSummary } : {}),
                  lifecycleEvent,
                })
                .catch((progressError) => {
                  this.logger.warn(
                    `Failed to update research agent progress for ${agent}: ${
                      progressError instanceof Error
                        ? progressError.message
                        : String(progressError)
                    }`,
                  );
                });

              this.notificationGateway.sendJobStatus(userId, {
                jobId: String(job.id),
                jobType: "ai_research",
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
                  rejected,
                  attempt: resolvedAttempt,
                  retryCount: resolvedRetryCount,
                },
              });
            },
          },
        ),
    });

    return {
      type: "ai_research",
      startupId: runResult.startupId,
      pipelineRunId: runResult.pipelineRunId,
      data: runResult.result,
    };
  }

  private readAgentRetryKey(
    metadata: Record<string, unknown> | undefined,
  ): ResearchAgentKey | undefined {
    if (!metadata || metadata.mode !== "agent_retry") {
      return undefined;
    }

    const agentKey = metadata.agentKey;
    if (
      agentKey === "team" ||
      agentKey === "market" ||
      agentKey === "product" ||
      agentKey === "news" ||
      agentKey === "competitor"
    ) {
      return agentKey;
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
