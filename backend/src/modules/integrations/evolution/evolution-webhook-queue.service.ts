import { Injectable } from "@nestjs/common";
import { QueueService } from "../../../queue";
import { QUEUE_NAMES } from "../../../queue/queue.config";
import type { EvolutionWhatsAppWebhookJobData } from "../../../queue/interfaces/job-data.interface";
import type { EvolutionInboundMessage } from "./evolution.types";

@Injectable()
export class EvolutionWebhookQueueService {
  constructor(private readonly queue: QueueService) {}

  async enqueueWhatsAppWebhook(payload: EvolutionInboundMessage): Promise<string> {
    const jobId = this.buildJobId(payload);
    const data: EvolutionWhatsAppWebhookJobData = {
      type: "evolution_whatsapp_webhook",
      userId: "system:evolution",
      payload,
    };

    return this.queue.addJob(QUEUE_NAMES.EVOLUTION_WHATSAPP_WEBHOOK, data, {
      jobId,
      attempts: 3,
    });
  }

  private buildJobId(payload: EvolutionInboundMessage): string {
    const messageId = payload.data?.key?.id?.trim();
    const instance = payload.instance?.trim() || "unknown";
    const event = payload.event?.trim() || "unknown";

    if (messageId) {
      return `evolution:${instance}:${messageId}`;
    }

    return `evolution:${instance}:${event}:${Date.now()}`;
  }
}
