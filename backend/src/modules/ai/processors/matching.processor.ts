import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Job } from "bullmq";
import { QUEUE_CONCURRENCY, QUEUE_NAMES } from "../../../queue";
import type { AiMatchingJobData, AiMatchingJobResult } from "../../../queue/interfaces";
import {
  BaseProcessor,
  parseRedisUrl,
} from "../../../queue/processors/base.processor";
import { StartupMatchingPipelineService } from "../services/startup-matching-pipeline.service";

@Injectable()
export class MatchingProcessor
  extends BaseProcessor<AiMatchingJobData, AiMatchingJobResult>
  implements OnModuleInit, OnModuleDestroy
{
  protected readonly logger = new Logger(MatchingProcessor.name);

  constructor(
    config: ConfigService,
    private startupMatching: StartupMatchingPipelineService,
  ) {
    const redisUrl = config.get<string>("REDIS_URL", "redis://localhost:6379");
    const queuePrefix = config.get<string>("QUEUE_PREFIX");
    super(
      QUEUE_NAMES.AI_MATCHING,
      parseRedisUrl(redisUrl),
      QUEUE_CONCURRENCY[QUEUE_NAMES.AI_MATCHING],
      queuePrefix,
    );
  }

  async onModuleInit() {
    await this.initialize();
    if (!this.worker) {
      this.logger.warn(
        "MatchingProcessor initialized without an active worker; recovery will retry automatically.",
      );
      return;
    }
    this.logger.log(
      `✅ MatchingProcessor ready | Queue: ${QUEUE_NAMES.AI_MATCHING} | Concurrency: ${QUEUE_CONCURRENCY[QUEUE_NAMES.AI_MATCHING]}`,
    );
  }

  async onModuleDestroy() {
    await this.close();
  }

  protected async process(
    job: Job<AiMatchingJobData>,
  ): Promise<Omit<AiMatchingJobResult, "jobId" | "duration" | "success">> {
    if (job.data.type !== "ai_matching") {
      throw new Error("Invalid job type for matching processor");
    }

    const result = await this.startupMatching.processMatchingJob(job.data);

    return {
      type: "ai_matching",
      startupId: job.data.startupId,
      analysisJobId: job.data.analysisJobId,
      data: result,
    };
  }
}
