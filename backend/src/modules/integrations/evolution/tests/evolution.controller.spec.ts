import { beforeEach, describe, expect, it, mock } from "bun:test";
import { UnauthorizedException } from "@nestjs/common";
import { EvolutionController } from "../evolution.controller";

const apiClient = {
  isValidWebhookKey: mock(() => true),
};
const webhookQueue = {
  enqueueWhatsAppWebhook: mock(async () => "job-1"),
};

describe("EvolutionController", () => {
  let controller: EvolutionController;

  beforeEach(() => {
    apiClient.isValidWebhookKey.mockClear();
    webhookQueue.enqueueWhatsAppWebhook.mockClear();
    controller = new EvolutionController(apiClient as never, webhookQueue as never);
  });

  it("queues WhatsApp webhooks and returns immediately", async () => {
    const payload = {
      event: "messages.upsert",
      instance: "clara",
      data: {
        key: {
          id: "msg-1",
          remoteJid: "15551234567@s.whatsapp.net",
        },
        message: { conversation: "hello" },
      },
    };

    await expect(
      controller.handleWhatsAppWebhook(payload, undefined, undefined, undefined),
    ).resolves.toEqual({ queued: true, jobId: "job-1" });

    expect(webhookQueue.enqueueWhatsAppWebhook).toHaveBeenCalledWith(payload);
  });

  it("rejects invalid webhook keys before enqueueing", async () => {
    apiClient.isValidWebhookKey.mockReturnValueOnce(false);

    await expect(
      controller.handleWhatsAppWebhook(
        { event: "messages.upsert", instance: "clara" },
        "bad-key",
        undefined,
        undefined,
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(webhookQueue.enqueueWhatsAppWebhook).not.toHaveBeenCalled();
  });
});
