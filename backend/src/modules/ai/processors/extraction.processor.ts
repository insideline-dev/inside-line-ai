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
import { PipelinePhase } from "../interfaces/pipeline.interface";
import { ExtractionService } from "../services/extraction.service";
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

  protected async process(
    job: Job<AiExtractionJobData>,
  ): Promise<Omit<AiExtractionJobResult, "jobId" | "duration" | "success">> {
    const { startupId } = job.data;

    if (job.data.type !== "ai_extraction") {
      throw new Error("Invalid job type for extraction processor");
    }

    const runResult = await runPipelinePhase({
      job,
      phase: PipelinePhase.EXTRACTION,
      jobType: "ai_extraction",
      pipelineState: this.pipelineState,
      pipelineService: this.pipelineService,
      notificationGateway: this.notificationGateway,
      run: () => this.extractionService.run(startupId),
    });

    return {
      type: "ai_extraction",
      startupId: runResult.startupId,
      pipelineRunId: runResult.pipelineRunId,
      data: runResult.result,
    };
  }
}
