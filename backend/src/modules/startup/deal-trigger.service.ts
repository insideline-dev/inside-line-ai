import { Injectable, Logger } from "@nestjs/common";
import { QueueService } from "../../queue/queue.service";
import { QUEUE_NAMES } from "../../queue/queue.config";
import type { TaskJobData } from "../../queue/interfaces/job-data.interface";
import {
  DEAL_TRIGGER_JOB,
  type DealTriggerPayload,
} from "../investor/deal-trigger.constants";

@Injectable()
export class DealTriggerService {
  private readonly logger = new Logger(DealTriggerService.name);

  constructor(private readonly queue: QueueService) {}

  async enqueue(payload: DealTriggerPayload): Promise<string | null> {
    const taskQueue = this.queue.getQueue(QUEUE_NAMES.TASK);
    if (!taskQueue) {
      this.logger.warn("TASK queue not initialized — skipping deal trigger");
      return null;
    }

    const jobId =
      payload.type === "doc.uploaded"
        ? `deal-trigger:doc:${payload.startupId}:${payload.fileId}`
        : payload.type === "deck.revised"
          ? `deal-trigger:deck:${payload.startupId}`
          : `deal-trigger:thesis:${payload.investorUserId}`;

    try {
      const job = await taskQueue.add(
        DEAL_TRIGGER_JOB,
        {
          type: "task",
          userId:
            payload.type === "thesis.updated"
              ? payload.investorUserId
              : payload.startupId,
          name: DEAL_TRIGGER_JOB,
          payload: payload as unknown as Record<string, unknown>,
        } satisfies TaskJobData,
        {
          jobId,
          attempts: 2,
          backoff: { type: "exponential", delay: 2_000 },
          removeOnComplete: true,
          removeOnFail: 50,
        },
      );

      return job.id ?? jobId;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Failed to enqueue deal trigger ${payload.type}: ${msg}`);
      return null;
    }
  }

  async notifyDocUploaded(startupId: string, fileId: string): Promise<void> {
    void this.enqueue({ type: "doc.uploaded", startupId, fileId });
  }

  async notifyDeckRevised(startupId: string): Promise<void> {
    void this.enqueue({ type: "deck.revised", startupId });
  }

  async notifyThesisUpdated(investorUserId: string): Promise<void> {
    void this.enqueue({ type: "thesis.updated", investorUserId });
  }
}
