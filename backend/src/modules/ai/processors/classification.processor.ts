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
import { DocumentClassificationService } from "../services/document-classification.service";

@Injectable()
export class ClassificationProcessor
  extends BaseProcessor<DocumentClassificationJobData, DocumentClassificationJobResult>
  implements OnModuleInit, OnModuleDestroy
{
  protected readonly logger = new Logger(ClassificationProcessor.name);

  constructor(
    config: ConfigService,
    private classificationService: DocumentClassificationService,
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
    const { startupId } = job.data;
    this.logger.log(`[Classification] Processing job ${job.id} for startup ${startupId}`);

    const classified = await this.classificationService.classifyDocuments(startupId);

    return {
      type: "document_classification",
      classifiedCount: classified.length,
    };
  }
}
