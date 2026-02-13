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
import { PipelinePhase } from "../interfaces/pipeline.interface";
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

  protected async process(
    job: Job<AiScrapingJobData>,
  ): Promise<Omit<AiScrapingJobResult, "jobId" | "duration" | "success">> {
    const { startupId } = job.data;

    if (job.data.type !== "ai_scraping") {
      throw new Error("Invalid job type for scraping processor");
    }

    const runResult = await runPipelinePhase({
      job,
      phase: PipelinePhase.SCRAPING,
      jobType: "ai_scraping",
      pipelineState: this.pipelineState,
      pipelineService: this.pipelineService,
      notificationGateway: this.notificationGateway,
      run: () => this.scrapingService.run(startupId),
    });

    return {
      type: "ai_scraping",
      startupId: runResult.startupId,
      pipelineRunId: runResult.pipelineRunId,
      data: runResult.result,
    };
  }
}
