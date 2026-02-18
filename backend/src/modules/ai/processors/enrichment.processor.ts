import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Job } from "bullmq";
import {
  AiEnrichmentJobData,
  AiEnrichmentJobResult,
} from "../../../queue/interfaces";
import { QUEUE_CONCURRENCY, QUEUE_NAMES } from "../../../queue";
import {
  BaseProcessor,
  parseRedisUrl,
} from "../../../queue/processors/base.processor";
import { NotificationGateway } from "../../../notification/notification.gateway";
import { PipelinePhase } from "../interfaces/pipeline.interface";
import { PipelineStateService } from "../services/pipeline-state.service";
import { PipelineService } from "../services/pipeline.service";
import {
  ENRICHMENT_AGENT_KEY,
  EnrichmentService,
} from "../services/enrichment.service";
import { PipelineAgentTraceService } from "../services/pipeline-agent-trace.service";
import { runPipelinePhase } from "./run-phase.util";

@Injectable()
export class EnrichmentProcessor
  extends BaseProcessor<AiEnrichmentJobData, AiEnrichmentJobResult>
  implements OnModuleInit, OnModuleDestroy
{
  protected readonly logger = new Logger(EnrichmentProcessor.name);

  constructor(
    config: ConfigService,
    private enrichmentService: EnrichmentService,
    private pipelineState: PipelineStateService,
    private pipelineService: PipelineService,
    private notificationGateway: NotificationGateway,
    private pipelineAgentTrace: PipelineAgentTraceService,
  ) {
    const redisUrl = config.get<string>("REDIS_URL", "redis://localhost:6379");
    const queuePrefix = config.get<string>("QUEUE_PREFIX");
    super(
      QUEUE_NAMES.AI_ENRICHMENT,
      parseRedisUrl(redisUrl),
      QUEUE_CONCURRENCY[QUEUE_NAMES.AI_ENRICHMENT],
      queuePrefix,
    );
  }

  async onModuleInit() {
    await this.initialize();
    if (!this.worker) {
      this.logger.warn(
        "EnrichmentProcessor initialized without an active worker; recovery will retry automatically.",
      );
      return;
    }
    this.logger.log(`EnrichmentProcessor ready | Queue: ${QUEUE_NAMES.AI_ENRICHMENT} | Concurrency: ${QUEUE_CONCURRENCY[QUEUE_NAMES.AI_ENRICHMENT]}`);
  }

  async onModuleDestroy() {
    await this.close();
  }

  protected async process(
    job: Job<AiEnrichmentJobData>,
  ): Promise<Omit<AiEnrichmentJobResult, "jobId" | "duration" | "success">> {
    const { startupId, userId, pipelineRunId } = job.data;

    if (job.data.type !== "ai_enrichment") {
      throw new Error("Invalid job type for enrichment processor");
    }

    const runResult = await runPipelinePhase({
      job,
      phase: PipelinePhase.ENRICHMENT,
      jobType: "ai_enrichment",
      pipelineState: this.pipelineState,
      pipelineService: this.pipelineService,
      notificationGateway: this.notificationGateway,
      run: () =>
        this.enrichmentService.run(startupId, {
          onAgentStart: (agentKey) => {
            this.pipelineService
              .onAgentProgress({
                startupId,
                userId,
                pipelineRunId,
                phase: PipelinePhase.ENRICHMENT,
                key: agentKey || ENRICHMENT_AGENT_KEY,
                status: "running",
                progress: 0,
              })
              .catch((progressError) => {
                this.logger.warn(
                  `Failed to mark enrichment agent running for ${agentKey}: ${
                    progressError instanceof Error
                      ? progressError.message
                      : String(progressError)
                  }`,
                );
              });
          },
          onAgentComplete: ({
            agentKey,
            inputPrompt,
            outputJson,
            outputText,
            error,
            usedFallback,
            attempt,
            retryCount,
            fallbackReason,
            rawProviderError,
          }) => {
            const isFailed = Boolean(error) && !usedFallback;
            const status = isFailed ? "failed" : "completed";
            const lifecycleEvent = usedFallback
              ? "fallback"
              : isFailed
                ? "failed"
                : "completed";
            const resolvedAgentKey = agentKey || ENRICHMENT_AGENT_KEY;

            this.pipelineService
              .onAgentProgress({
                startupId,
                userId,
                pipelineRunId,
                phase: PipelinePhase.ENRICHMENT,
                key: resolvedAgentKey,
                status,
                progress: isFailed ? 0 : 100,
                error,
                usedFallback,
                attempt,
                retryCount,
                fallbackReason,
                rawProviderError,
                lifecycleEvent,
              })
              .catch((progressError) => {
                this.logger.warn(
                  `Failed to update enrichment agent progress for ${resolvedAgentKey}: ${
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
                phase: PipelinePhase.ENRICHMENT,
                agentKey: resolvedAgentKey,
                status: usedFallback ? "fallback" : isFailed ? "failed" : "completed",
                usedFallback,
                inputPrompt,
                outputJson,
                outputText,
                error,
                attempt,
                retryCount,
                fallbackReason,
                rawProviderError,
              })
              .catch((traceError) => {
                this.logger.warn(
                  `Failed to persist enrichment trace for ${resolvedAgentKey}: ${
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
      type: "ai_enrichment",
      startupId: runResult.startupId,
      pipelineRunId: runResult.pipelineRunId,
      data: runResult.result,
    };
  }
}
