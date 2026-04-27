import { afterEach, describe, expect, it, mock } from "bun:test";
import { EvolutionApiClientService } from "../evolution-api-client.service";

const createService = (webhookSecret?: string) => {
  const config = {
    get: mock((key: string) => {
      if (key === "EVOLUTION_WEBHOOK_SECRET") return webhookSecret;
      if (key === "EVOLUTION_API_URL") return "https://evolution.test";
      if (key === "EVOLUTION_API_KEY") return "api-key";
      if (key === "EVOLUTION_INSTANCE_NAME") return "clara";
      return undefined;
    }),
  };
  return new EvolutionApiClientService(config as never);
};

describe("EvolutionApiClientService", () => {
  afterEach(() => {
    mock.restore();
  });
  it("accepts unsigned webhooks when no webhook secret is configured", () => {
    const service = createService();

    expect(service.isValidWebhookKey(undefined)).toBe(true);
  });

  it("requires the configured webhook secret when present", () => {
    const service = createService("secret-1");

    expect(service.isValidWebhookKey(undefined)).toBe(false);
    expect(service.isValidWebhookKey("wrong")).toBe(false);
    expect(service.isValidWebhookKey("secret-1")).toBe(true);
  });

  it("requests media using the full Evolution message payload and nested response shapes", async () => {
    const originalFetch = globalThis.fetch;
    const fetchMock = mock(async (_url: string, init?: RequestInit) => {
      expect(JSON.parse(String(init?.body))).toEqual({
        message: {
          key: {
            id: "msg-1",
            remoteJid: "15551234567@s.whatsapp.net",
          },
          message: {
            imageMessage: {
              mimetype: "image/jpeg",
            },
          },
        },
        convertToMp4: false,
      });

      return new Response(
        JSON.stringify({ data: { media: "base64-data", mimeType: "image/jpeg" } }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });
    globalThis.fetch = fetchMock as never;

    try {
      const service = createService();
      const result = await service.getMediaBase64({
        event: "messages.upsert",
        instance: "clara",
        data: {
          key: { id: "msg-1", remoteJid: "15551234567@s.whatsapp.net" },
          message: { imageMessage: { mimetype: "image/jpeg" } },
        },
      });

      expect(result).toEqual({ base64: "base64-data", mimetype: "image/jpeg" });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
