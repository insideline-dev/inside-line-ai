import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Job } from "bullmq";
import { QUEUE_CONCURRENCY, QUEUE_NAMES } from "../../../../queue/queue.config";
import { BaseProcessor, parseRedisUrl } from "../../../../queue/processors/base.processor";
import type { EvolutionWhatsAppWebhookJobData } from "../../../../queue/interfaces/job-data.interface";
import type { EvolutionWhatsAppWebhookJobResult } from "../../../../queue/interfaces/job-result.interface";
import { EvolutionService } from "../evolution.service";
import { evolutionWebhookSchema } from "../dto/evolution-webhook.dto";

@Injectable()
export class EvolutionWhatsAppWebhookProcessor
  extends BaseProcessor<EvolutionWhatsAppWebhookJobData, EvolutionWhatsAppWebhookJobResult>
  implements OnModuleInit, OnModuleDestroy
{
  protected readonly logger = new Logger(EvolutionWhatsAppWebhookProcessor.name);

  constructor(
    config: ConfigService,
    private readonly evolution: EvolutionService,
  ) {
    const redisUrl = config.get<string>("REDIS_URL", "redis://localhost:6379");
    const queuePrefix = config.get<string>("QUEUE_PREFIX");
    super(
      QUEUE_NAMES.EVOLUTION_WHATSAPP_WEBHOOK,
      parseRedisUrl(redisUrl),
      QUEUE_CONCURRENCY[QUEUE_NAMES.EVOLUTION_WHATSAPP_WEBHOOK],
      queuePrefix,
    );
  }

  onModuleInit() {
    this.initialize();
  }

  async onModuleDestroy() {
    await this.close();
  }

  protected async process(
    job: Job<EvolutionWhatsAppWebhookJobData>,
  ): Promise<Omit<EvolutionWhatsAppWebhookJobResult, "jobId" | "duration" | "success">> {
    try {
      const payload = evolutionWebhookSchema.parse(job.data.payload);
      const result = await this.evolution.handleWebhook(payload);

      return {
        type: "evolution_whatsapp_webhook",
        processed: result.processed,
        reason: result.reason,
      };
    } catch (error) {
      this.logger.error(this.formatError(error));
      throw error;
    }
  }

  private formatError(error: unknown): string {
    if (!(error instanceof Error)) {
      return String(error);
    }

    const cause = error.cause instanceof Error ? `; cause=${error.cause.message}` : "";
    return `${error.message}${cause}`;
  }
}
