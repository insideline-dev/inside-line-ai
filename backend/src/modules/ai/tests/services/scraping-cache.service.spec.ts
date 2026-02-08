import { beforeEach, describe, expect, it, jest, mock } from "bun:test";
import { ConfigService } from "@nestjs/config";

class MockRedis {
  private store = new Map<string, string>();
  connect() {
    return Promise.resolve();
  }
  on() {
    return this;
  }
  async get(key: string) {
    return this.store.get(key) ?? null;
  }
  async set(key: string, value: string) {
    this.store.set(key, value);
    return "OK";
  }
  async del(key: string) {
    this.store.delete(key);
    return 1;
  }
  async quit() {
    return "OK";
  }
}

mock.module("ioredis", () => ({
  default: MockRedis,
}));

import { ScrapingCacheService } from "../../services/scraping-cache.service";

describe("ScrapingCacheService", () => {
  let config: jest.Mocked<ConfigService>;
  let service: ScrapingCacheService;

  beforeEach(() => {
    config = {
      get: jest.fn((key: string, fallback?: unknown) => {
        if (key === "REDIS_URL") return "redis://localhost:6379";
        return fallback;
      }),
    } as unknown as jest.Mocked<ConfigService>;

    service = new ScrapingCacheService(config);
  });

  it("stores and retrieves website cache", async () => {
    await service.setWebsiteCache("https://inside-line.test", {
      title: "Inside Line",
      fullText: "content",
    });

    const cached = await service.getWebsiteCache<{ title: string; fullText: string }>(
      "https://inside-line.test",
    );

    expect(cached?.title).toBe("Inside Line");
    expect(cached?.fullText).toBe("content");
  });

  it("stores and retrieves linkedin cache", async () => {
    await service.setLinkedinCache("https://linkedin.com/in/alex", {
      name: "Alex",
      role: "CEO",
    });

    const cached = await service.getLinkedinCache<{ name: string; role: string }>(
      "https://linkedin.com/in/alex",
    );

    expect(cached?.name).toBe("Alex");
  });
});
