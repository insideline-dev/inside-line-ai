import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Job } from "bullmq";
import {
  AiSynthesisJobData,
  AiSynthesisJobResult,
} from "../../../queue/interfaces";
import { QUEUE_CONCURRENCY, QUEUE_NAMES } from "../../../queue";
import {
  BaseProcessor,
  parseRedisUrl,
} from "../../../queue/processors/base.processor";
import { NotificationGateway } from "../../../notification/notification.gateway";
import { PipelinePhase } from "../interfaces/pipeline.interface";
import { PipelineAgentTraceService } from "../services/pipeline-agent-trace.service";
import { PipelineStateService } from "../services/pipeline-state.service";
import { PipelineService } from "../services/pipeline.service";
import {
  SynthesisService,
  type SynthesisRunTraceDetails,
  type SynthesisProgressCallbacks,
} from "../services/synthesis.service";
import { MEMO_SYNTHESIS_AGENT_KEY, REPORT_SYNTHESIS_AGENT_KEY } from "../constants/agent-keys";
import { runPipelinePhase } from "./run-phase.util";

interface SynthesisTracePayload {
  agentKey: string;
  status: "completed" | "fallback" | "failed";
  attempt: number;
  retryCount: number;
  usedFallback: boolean;
  inputPrompt?: string;
  systemPrompt?: string;
  outputText?: string;
  outputJson?: unknown;
  error?: string;
  fallbackReason?:
    | "EMPTY_STRUCTURED_OUTPUT"
    | "TIMEOUT"
    | "SCHEMA_OUTPUT_INVALID"
    | "MODEL_OR_PROVIDER_ERROR"
    | "UNHANDLED_AGENT_EXCEPTION";
  rawProviderError?: string;
}

@Injectable()
export class SynthesisProcessor
  extends BaseProcessor<AiSynthesisJobData, AiSynthesisJobResult>
  implements OnModuleInit, OnModuleDestroy
{
  protected readonly logger = new Logger(SynthesisProcessor.name);

  constructor(
    config: ConfigService,
    private synthesisService: SynthesisService,
    private pipelineState: PipelineStateService,
    private pipelineService: PipelineService,
    private notificationGateway: NotificationGateway,
    private pipelineAgentTrace: PipelineAgentTraceService,
  ) {
    const redisUrl = config.get<string>("REDIS_URL", "redis://localhost:6379");
    const queuePrefix = config.get<string>("QUEUE_PREFIX");
    super(
      QUEUE_NAMES.AI_SYNTHESIS,
      parseRedisUrl(redisUrl),
      QUEUE_CONCURRENCY[QUEUE_NAMES.AI_SYNTHESIS],
      queuePrefix,
    );
  }

  async onModuleInit() {
    await this.initialize();
    if (!this.worker) {
      this.logger.warn(
        "SynthesisProcessor initialized without an active worker; recovery will retry automatically.",
      );
      return;
    }
    this.logger.log(`✅ SynthesisProcessor ready | Queue: ${QUEUE_NAMES.AI_SYNTHESIS} | Concurrency: ${QUEUE_CONCURRENCY[QUEUE_NAMES.AI_SYNTHESIS]}`);
  }

  async onModuleDestroy() {
    await this.close();
  }

  protected override async onWorkerStalled(
    job: Job<AiSynthesisJobData>,
  ): Promise<void> {
    const { startupId, pipelineRunId, userId } = job.data;
    await this.pipelineService.recordInfrastructureIssue({
      startupId,
      pipelineRunId,
      userId,
      phase: PipelinePhase.SYNTHESIS,
      stepKey: "worker_stalled",
      error: `BullMQ worker marked synthesis job ${job.id} as stalled`,
      failureSource: "worker_stalled",
      meta: {
        queueName: QUEUE_NAMES.AI_SYNTHESIS,
        jobId: String(job.id),
        jobType: job.data.type,
      },
    });
  }

  protected async process(
    job: Job<AiSynthesisJobData>,
  ): Promise<Omit<AiSynthesisJobResult, "jobId" | "duration" | "success">> {
    const { startupId, pipelineRunId, userId } = job.data;

    if (job.data.type !== "ai_synthesis") {
      throw new Error("Invalid job type for synthesis processor");
    }

    const runResult = await runPipelinePhase({
      job,
      phase: PipelinePhase.SYNTHESIS,
      jobType: "ai_synthesis",
      pipelineState: this.pipelineState,
      pipelineService: this.pipelineService,
      notificationGateway: this.notificationGateway,
      run: async () => {
        const startedAt = new Date();

        // Initialize both agents: memo running, report pending
        await this.safeUpdateAgentProgress({
          startupId,
          userId,
          pipelineRunId,
          phase: PipelinePhase.SYNTHESIS,
          key: MEMO_SYNTHESIS_AGENT_KEY,
          status: "running",
          progress: 0,
          attempt: 1,
          retryCount: 0,
          lifecycleEvent: "started",
        });
        await this.safeUpdateAgentProgress({
          startupId,
          userId,
          pipelineRunId,
          phase: PipelinePhase.SYNTHESIS,
          key: REPORT_SYNTHESIS_AGENT_KEY,
          status: "pending",
          progress: 0,
          attempt: 1,
          retryCount: 0,
        });

        try {
          const callbacks: SynthesisProgressCallbacks = {
            onMemoCompleted: (trace: SynthesisRunTraceDetails) => {
              void this.safeUpdateAgentProgress({
                startupId,
                userId,
                pipelineRunId,
                phase: PipelinePhase.SYNTHESIS,
                key: MEMO_SYNTHESIS_AGENT_KEY,
                status: "completed",
                progress: 100,
                attempt: trace.attempt,
                retryCount: trace.retryCount,
                usedFallback: trace.usedFallback,
                error: trace.error,
                fallbackReason: trace.fallbackReason as SynthesisTracePayload["fallbackReason"],
                rawProviderError: trace.rawProviderError,
                lifecycleEvent: trace.usedFallback ? "fallback" : "completed",
              });
              void this.safeUpdateAgentProgress({
                startupId,
                userId,
                pipelineRunId,
                phase: PipelinePhase.SYNTHESIS,
                key: REPORT_SYNTHESIS_AGENT_KEY,
                status: "running",
                progress: 0,
                attempt: 1,
                retryCount: 0,
                lifecycleEvent: "started",
              });
            },
            onReportCompleted: (trace: SynthesisRunTraceDetails) => {
              void this.safeUpdateAgentProgress({
                startupId,
                userId,
                pipelineRunId,
                phase: PipelinePhase.SYNTHESIS,
                key: REPORT_SYNTHESIS_AGENT_KEY,
                status: "completed",
                progress: 100,
                attempt: trace.attempt,
                retryCount: trace.retryCount,
                usedFallback: trace.usedFallback,
                error: trace.error,
                fallbackReason: trace.fallbackReason as SynthesisTracePayload["fallbackReason"],
                rawProviderError: trace.rawProviderError,
                lifecycleEvent: trace.usedFallback ? "fallback" : "completed",
              });
            },
          };

          const details = await this.synthesisService.runDetailed(startupId, callbacks);
          const completedAt = new Date();

          // Record traces for each agent
          for (const trace of details.traces) {
            await this.safeRecordTrace({
              startupId,
              pipelineRunId,
              trace,
              startedAt,
              completedAt,
            });

            if (trace.usedFallback) {
              await this.pipelineState.setQuality(startupId, "degraded");
            }
          }

          return details.synthesis;
        } catch (error) {
          const completedAt = new Date();
          const message = error instanceof Error ? error.message : String(error);

          await this.safeUpdateAgentProgress({
            startupId,
            userId,
            pipelineRunId,
            phase: PipelinePhase.SYNTHESIS,
            key: MEMO_SYNTHESIS_AGENT_KEY,
            status: "failed",
            progress: 0,
            attempt: 1,
            retryCount: 0,
            error: message,
            usedFallback: false,
            lifecycleEvent: "failed",
          });
          await this.safeUpdateAgentProgress({
            startupId,
            userId,
            pipelineRunId,
            phase: PipelinePhase.SYNTHESIS,
            key: REPORT_SYNTHESIS_AGENT_KEY,
            status: "failed",
            progress: 0,
            attempt: 1,
            retryCount: 0,
            error: message,
            usedFallback: false,
            lifecycleEvent: "failed",
          });

          await this.safeRecordTrace({
            startupId,
            pipelineRunId,
            trace: {
              agentKey: MEMO_SYNTHESIS_AGENT_KEY,
              status: "failed",
              attempt: 1,
              retryCount: 0,
              usedFallback: false,
              error: message,
            },
            startedAt,
            completedAt,
          });

          throw error;
        }
      },
    });

    return {
      type: "ai_synthesis",
      startupId: runResult.startupId,
      pipelineRunId: runResult.pipelineRunId,
      data: runResult.result,
    };
  }

  private async safeUpdateAgentProgress(params: {
    startupId: string;
    userId: string;
    pipelineRunId: string;
    phase: PipelinePhase;
    key: string;
    status: "pending" | "running" | "completed" | "failed";
    progress?: number;
    error?: string;
    attempt?: number;
    retryCount?: number;
    usedFallback?: boolean;
    fallbackReason?:
      | "EMPTY_STRUCTURED_OUTPUT"
      | "TIMEOUT"
      | "SCHEMA_OUTPUT_INVALID"
      | "MODEL_OR_PROVIDER_ERROR"
      | "UNHANDLED_AGENT_EXCEPTION";
    rawProviderError?: string;
    lifecycleEvent?: "started" | "retrying" | "completed" | "failed" | "fallback";
  }): Promise<void> {
    await this.pipelineService.onAgentProgress(params).catch((progressError) => {
      this.logger.warn(
        `Failed to update synthesis agent progress: ${
          progressError instanceof Error
            ? progressError.message
            : String(progressError)
        }`,
      );
    });
  }

  private async safeRecordTrace(input: {
    startupId: string;
    pipelineRunId: string;
    trace: SynthesisTracePayload;
    startedAt: Date;
    completedAt: Date;
  }): Promise<void> {
    await this.pipelineAgentTrace
      .recordRun({
        startupId: input.startupId,
        pipelineRunId: input.pipelineRunId,
        phase: PipelinePhase.SYNTHESIS,
        agentKey: input.trace.agentKey,
        status: input.trace.status,
        attempt: input.trace.attempt,
        retryCount: input.trace.retryCount,
        usedFallback: input.trace.usedFallback,
        inputPrompt: input.trace.inputPrompt,
        systemPrompt: input.trace.systemPrompt,
        outputText: input.trace.outputText,
        outputJson: input.trace.outputJson,
        error: input.trace.error,
        fallbackReason: input.trace.fallbackReason,
        rawProviderError: input.trace.rawProviderError,
        startedAt: input.startedAt,
        completedAt: input.completedAt,
      })
      .catch((traceError) => {
        this.logger.warn(
          `Failed to persist synthesis trace: ${
            traceError instanceof Error ? traceError.message : String(traceError)
          }`,
        );
      });
  }
}
