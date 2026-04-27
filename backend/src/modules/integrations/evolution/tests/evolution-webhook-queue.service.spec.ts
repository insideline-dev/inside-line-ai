import { beforeEach, describe, expect, it, mock } from "bun:test";
import { QUEUE_NAMES } from "../../../../queue/queue.config";
import { EvolutionWebhookQueueService } from "../evolution-webhook-queue.service";

const queue = {
  addJob: mock(async () => "job-1"),
};

describe("EvolutionWebhookQueueService", () => {
  let service: EvolutionWebhookQueueService;

  beforeEach(() => {
    queue.addJob.mockClear();
    service = new EvolutionWebhookQueueService(queue as never);
  });

  it("enqueues WhatsApp webhooks using the Evolution message id as job id", async () => {
    const result = await service.enqueueWhatsAppWebhook({
      event: "messages.upsert",
      instance: "clara",
      data: {
        key: {
          id: "msg-1",
          remoteJid: "15551234567@s.whatsapp.net",
        },
        message: { conversation: "hello" },
      },
    });

    expect(result).toBe("job-1");
    expect(queue.addJob).toHaveBeenCalledWith(
      QUEUE_NAMES.EVOLUTION_WHATSAPP_WEBHOOK,
      {
        type: "evolution_whatsapp_webhook",
        userId: "system:evolution",
        payload: expect.objectContaining({ event: "messages.upsert" }),
      },
      {
        jobId: "evolution:clara:msg-1",
        attempts: 3,
      },
    );
  });
});
