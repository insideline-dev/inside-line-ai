import { beforeEach, describe, expect, it, mock } from "bun:test";
import { EvolutionWhatsAppWebhookProcessor } from "../processors/evolution-whatsapp-webhook.processor";

const config = {
  get: mock((key: string, fallback?: unknown) => {
    if (key === "REDIS_URL") return "redis://localhost:6379";
    return fallback;
  }),
};
const evolution = {
  handleWebhook: mock(async () => ({ processed: true, reason: "ok" })),
};

describe("EvolutionWhatsAppWebhookProcessor", () => {
  let processor: EvolutionWhatsAppWebhookProcessor;

  beforeEach(() => {
    config.get.mockClear();
    evolution.handleWebhook.mockClear();
    processor = new EvolutionWhatsAppWebhookProcessor(config as never, evolution as never);
  });

  it("processes queued webhook payloads through EvolutionService", async () => {
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

    const result = await processor["process"]({
      data: {
        type: "evolution_whatsapp_webhook",
        userId: "system:evolution",
        payload,
      },
    } as never);

    expect(evolution.handleWebhook).toHaveBeenCalledWith(payload);
    expect(result).toEqual({
      type: "evolution_whatsapp_webhook",
      processed: true,
      reason: "ok",
    });
  });
});
