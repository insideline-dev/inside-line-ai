import { describe, expect, it, mock } from "bun:test";
import { EvolutionApiClientService } from "../evolution-api-client.service";

const createService = (webhookSecret?: string) => {
  const config = {
    get: mock((key: string) => (key === "EVOLUTION_WEBHOOK_SECRET" ? webhookSecret : undefined)),
  };
  return new EvolutionApiClientService(config as never);
};

describe("EvolutionApiClientService", () => {
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
});
