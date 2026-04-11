import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Job } from "bullmq";
import {
  DocumentClassificationJobData,
  DocumentClassificationJobResult,
} from "../../../queue/interfaces";
import { QUEUE_CONCURRENCY, QUEUE_NAMES } from "../../../queue";
import {
  BaseProcessor,
  parseRedisUrl,
} from "../../../queue/processors/base.processor";
import { NotificationGateway } from "../../../notification/notification.gateway";
import { PipelinePhase } from "../interfaces/pipeline.interface";
import type { ClassificationPhaseResult, ClassifiedDocumentTrace } from "../interfaces/phase-results.interface";
import { DataRoomService } from "../../startup/data-room.service";
import { PipelineAgentTraceService } from "../services/pipeline-agent-trace.service";
import { PipelineStateService } from "../services/pipeline-state.service";
import { PipelineService } from "../services/pipeline.service";
import { runPipelinePhase } from "./run-phase.util";

@Injectable()
export class ClassificationProcessor
  extends BaseProcessor<DocumentClassificationJobData, DocumentClassificationJobResult>
  implements OnModuleInit, OnModuleDestroy
{
  protected readonly logger = new Logger(ClassificationProcessor.name);

  constructor(
    config: ConfigService,
    private dataRoomService: DataRoomService,
    private pipelineState: PipelineStateService,
    private pipelineService: PipelineService,
    private notificationGateway: NotificationGateway,
    private pipelineAgentTrace: PipelineAgentTraceService,
  ) {
    const redisUrl = config.get<string>("REDIS_URL", "redis://localhost:6379");
    const queuePrefix = config.get<string>("QUEUE_PREFIX");
    super(
      QUEUE_NAMES.DOCUMENT_CLASSIFICATION,
      parseRedisUrl(redisUrl),
      QUEUE_CONCURRENCY[QUEUE_NAMES.DOCUMENT_CLASSIFICATION],
      queuePrefix,
    );
  }

  async onModuleInit() {
    await this.initialize();
    if (!this.worker) {
      this.logger.warn(
        "ClassificationProcessor initialized without an active worker; recovery will retry automatically.",
      );
      return;
    }
    this.logger.log(
      `✅ ClassificationProcessor ready | Queue: ${QUEUE_NAMES.DOCUMENT_CLASSIFICATION} | Concurrency: ${QUEUE_CONCURRENCY[QUEUE_NAMES.DOCUMENT_CLASSIFICATION]}`,
    );
  }

  async onModuleDestroy() {
    await this.close();
  }

  protected async process(
    job: Job<DocumentClassificationJobData>,
  ): Promise<Omit<DocumentClassificationJobResult, "jobId" | "duration" | "success">> {
    const { startupId, userId, pipelineRunId } = job.data;

    const recordTrace = (
      stepKey: string,
      status: "running" | "completed" | "failed",
      payload?: {
        outputJson?: unknown;
        outputText?: string;
        meta?: Record<string, unknown>;
        error?: string;
      },
    ) => {
      void this.pipelineAgentTrace
        .recordRun({
          startupId,
          pipelineRunId,
          phase: PipelinePhase.CLASSIFICATION,
          agentKey: stepKey,
          traceKind: "phase_step",
          stepKey,
          status,
          outputText: payload?.outputText,
          outputJson: payload?.outputJson,
          meta: payload?.meta,
          error: payload?.error,
        })
        .catch((traceError) => {
          this.logger.warn(
            `Failed to persist classification step trace for ${stepKey}: ${
              traceError instanceof Error ? traceError.message : String(traceError)
            }`,
          );
        });
    };

    const emitAgentProgress = (params: {
      key: string;
      status: "running" | "completed" | "failed";
      lifecycleEvent: "started" | "completed" | "failed";
      progress: number;
      dataSummary?: Record<string, unknown>;
      error?: string;
    }) => {
      void this.pipelineService
        .onAgentProgress({
          startupId,
          userId,
          pipelineRunId,
          phase: PipelinePhase.CLASSIFICATION,
          key: params.key,
          status: params.status,
          progress: params.progress,
          lifecycleEvent: params.lifecycleEvent,
          dataSummary: params.dataSummary,
          error: params.error,
        })
        .catch((progressError) => {
          this.logger.warn(
            `Failed to emit classification progress for ${params.key}: ${
              progressError instanceof Error
                ? progressError.message
                : String(progressError)
            }`,
          );
        });
    };

    const documents: ClassifiedDocumentTrace[] = [];
    let failedCount = 0;

    const runResult = await runPipelinePhase({
      job,
      phase: PipelinePhase.CLASSIFICATION,
      jobType: "document_classification",
      pipelineState: this.pipelineState,
      pipelineService: this.pipelineService,
      notificationGateway: this.notificationGateway,
      run: async () => {
        const classifiedRows = await this.dataRoomService.reclassifyAll(
          startupId,
          {
          onFileStart: (event) => {
            const stepKey = `classify:${event.fileName}`;
            recordTrace(stepKey, "running", {
              outputText: `Classifying ${event.fileName}…`,
              meta: { fileName: event.fileName },
            });
            emitAgentProgress({
              key: stepKey,
              status: "running",
              lifecycleEvent: "started",
              progress: 0,
              dataSummary: { fileName: event.fileName },
            });
          },
          onFileSuccess: (event) => {
            const stepKey = `classify:${event.fileName}`;
            const summary = {
              fileName: event.fileName,
              category: event.category,
              confidence: event.confidence,
              routedAgents: event.routedAgents,
            };
            documents.push({
              dataRoomId: event.dataRoomId,
              fileName: event.fileName,
              category: event.category,
              confidence: event.confidence,
              routedAgents: event.routedAgents,
            });
            recordTrace(stepKey, "completed", {
              outputJson: summary,
              outputText: `${event.fileName} → ${event.category} (${Math.round(event.confidence * 100)}%) → ${event.routedAgents.join(", ") || "no agents"}`,
              meta: summary,
            });
            emitAgentProgress({
              key: stepKey,
              status: "completed",
              lifecycleEvent: "completed",
              progress: 100,
              dataSummary: summary,
            });
          },
          onFileFailure: (event) => {
            failedCount += 1;
            const stepKey = `classify:${event.fileName}`;
            documents.push({
              dataRoomId: event.dataRoomId,
              fileName: event.fileName,
              category: "miscellaneous" as ClassifiedDocumentTrace["category"],
              confidence: 0,
              routedAgents: [],
              error: event.error,
            });
            recordTrace(stepKey, "failed", {
              outputText: `Failed: ${event.error}`,
              meta: { fileName: event.fileName },
              error: event.error,
            });
            emitAgentProgress({
              key: stepKey,
              status: "failed",
              lifecycleEvent: "failed",
              progress: 0,
              error: event.error,
              dataSummary: { fileName: event.fileName },
            });
          },
          },
          { onlyPending: true },
        );

        // Skip path: if every doc was already classified inline (e.g. by
        // Clara at intake), the callbacks above never fired. Backfill the
        // trace surface from the returned rows so phase telemetry still
        // reflects the real data-room state.
        const skipped = documents.length === 0 && classifiedRows.length > 0;
        if (skipped) {
          for (const row of classifiedRows) {
            if (row.classificationStatus !== "completed") continue;
            const rawConfidence = Number(row.classificationConfidence);
            documents.push({
              dataRoomId: row.id,
              fileName: row.id,
              category: (row.category ?? "miscellaneous") as ClassifiedDocumentTrace["category"],
              confidence: Number.isFinite(rawConfidence) ? rawConfidence : 0,
              routedAgents: row.routedAgents ?? [],
            });
          }
          const skippedCount = documents.length;
          recordTrace("classify:skipped", "completed", {
            outputText: `Skipped — ${skippedCount} document${skippedCount === 1 ? "" : "s"} already classified inline`,
            meta: { skipped: true, count: skippedCount },
          });
        }

        const phaseResult: ClassificationPhaseResult = {
          classifiedCount: documents.length - failedCount,
          failedCount,
          documents,
        };
        return phaseResult;
      },
    });

    return {
      type: "document_classification",
      classifiedCount: runResult.result?.classifiedCount ?? 0,
    };
  }
}
