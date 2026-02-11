import { beforeEach, describe, expect, it, mock } from "bun:test";
import { RedisFallbackClient } from "../../services/redis-fallback.service";

const globalStore = new Map<string, { value: string; expiresAt: number }>();
let globalConnectCount = 0;
let globalQuitCount = 0;
let globalShouldFail = false;

class MockRedis {
  private isConnected = false;
  private errorHandler: ((error: Error) => void) | null = null;

  connect() {
    globalConnectCount++;
    if (globalShouldFail) {
      throw new Error("Connection failed");
    }
    this.isConnected = true;
    return Promise.resolve();
  }

  on(event: string, handler: (error: Error) => void) {
    if (event === "error") {
      this.errorHandler = handler;
    }
    return this;
  }

  async get(key: string) {
    if (!this.isConnected || globalShouldFail) {
      throw new Error("Redis unavailable");
    }
    const entry = globalStore.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
      globalStore.delete(key);
      return null;
    }
    return entry.value;
  }

  async set(key: string, value: string, _mode: string, ttlSeconds: number) {
    if (!this.isConnected || globalShouldFail) {
      throw new Error("Redis unavailable");
    }
    globalStore.set(key, {
      value,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
    return "OK";
  }

  async del(key: string) {
    if (!this.isConnected || globalShouldFail) {
      throw new Error("Redis unavailable");
    }
    globalStore.delete(key);
    return 1;
  }

  async quit() {
    globalQuitCount++;
    this.isConnected = false;
    return "OK";
  }
}

let mockRedisInstance: MockRedis | null = null;

mock.module("ioredis", () => ({
  default: class {
    constructor() {
      mockRedisInstance = new MockRedis();
      return mockRedisInstance;
    }
  },
}));

describe("RedisFallbackClient", () => {
  let client: RedisFallbackClient;

  beforeEach(() => {
    mockRedisInstance = null;
    globalStore.clear();
    globalConnectCount = 0;
    globalQuitCount = 0;
    globalShouldFail = false;

    client = new RedisFallbackClient({
      redisUrl: "redis://localhost:6379",
      recoveryIntervalMs: 1000,
      maxMemoryEntries: 3,
      loggerContext: "TestRedis",
    });
  });

  it("successfully connects to Redis and performs get/set/del", async () => {
    await new Promise((resolve) => setTimeout(resolve, 50));

    await client.set("key1", "value1", 60);
    const result = await client.get("key1");
    expect(result).toBe("value1");

    await client.del("key1");
    const deleted = await client.get("key1");
    expect(deleted).toBeNull();
  });

  it("falls back to in-memory when Redis is unavailable", async () => {
    globalShouldFail = true;
    await new Promise((resolve) => setTimeout(resolve, 50));

    await client.set("key2", "value2", 60);
    const result = await client.get("key2");
    expect(result).toBe("value2");
  });

  it("LRU eviction evicts the least recently accessed entry", async () => {
    await new Promise((resolve) => setTimeout(resolve, 50));
    globalShouldFail = true;

    await client.set("key1", "value1", 60);
    await new Promise((resolve) => setTimeout(resolve, 10));
    await client.set("key2", "value2", 60);
    await new Promise((resolve) => setTimeout(resolve, 10));
    await client.set("key3", "value3", 60);

    await new Promise((resolve) => setTimeout(resolve, 10));
    await client.get("key1");
    await new Promise((resolve) => setTimeout(resolve, 10));

    await client.set("key4", "value4", 60);

    const key1Result = await client.get("key1");
    const key2Result = await client.get("key2");

    expect(key1Result).toBe("value1");
    expect(key2Result).toBeNull();
  });

  it("memory store respects TTL and expired entries return null", async () => {
    await new Promise((resolve) => setTimeout(resolve, 50));
    globalShouldFail = true;

    await client.set("expiring", "value", 0.05);
    const immediate = await client.get("expiring");
    expect(immediate).toBe("value");

    await new Promise((resolve) => setTimeout(resolve, 100));
    const expired = await client.get("expiring");
    expect(expired).toBeNull();
  });

  it("recovery attempt creates new connection and restores Redis mode", async () => {
    await new Promise((resolve) => setTimeout(resolve, 50));

    const initialConnectCount = globalConnectCount;

    globalShouldFail = true;
    await client.set("key", "value", 60);

    globalShouldFail = false;

    await client.get("key");
    await new Promise((resolve) => setTimeout(resolve, 1100));
    await client.set("another", "value", 60);
    await new Promise((resolve) => setTimeout(resolve, 100));

    const finalConnectCount = globalConnectCount;
    expect(finalConnectCount).toBeGreaterThan(initialConnectCount);
  });

  it("recovery doesn't run concurrently (reconnectInFlight guard)", async () => {
    await new Promise((resolve) => setTimeout(resolve, 50));
    globalShouldFail = true;

    await client.set("key", "value", 60);

    const initialConnectCount = globalConnectCount;

    globalShouldFail = false;

    await Promise.all([client.get("key"), client.get("key"), client.get("key")]);

    await new Promise((resolve) => setTimeout(resolve, 1200));

    await Promise.all([client.get("key"), client.get("key"), client.get("key")]);

    const finalConnectCount = globalConnectCount;
    expect(finalConnectCount - initialConnectCount).toBeLessThanOrEqual(2);
  });

  it("recovery respects cooldown interval and doesn't retry too quickly", async () => {
    await new Promise((resolve) => setTimeout(resolve, 50));

    globalShouldFail = true;
    await client.set("key", "value", 60);

    globalShouldFail = false;

    await client.get("key");
    await new Promise((resolve) => setTimeout(resolve, 200));

    const countBefore = globalConnectCount;

    await Promise.all([
      client.get("key"),
      client.set("key2", "value2", 60),
      client.get("key"),
    ]);

    expect(globalConnectCount).toBe(countBefore);
  });

  it("old Redis client is properly quit before creating new one", async () => {
    await new Promise((resolve) => setTimeout(resolve, 50));

    const initialQuitCount = globalQuitCount;

    globalShouldFail = true;
    await client.set("key", "value", 60);

    globalShouldFail = false;
    await client.get("key");
    await new Promise((resolve) => setTimeout(resolve, 1200));
    await client.set("key2", "value2", 60);
    await new Promise((resolve) => setTimeout(resolve, 100));

    const finalQuitCount = globalQuitCount;
    expect(finalQuitCount).toBeGreaterThan(initialQuitCount);
  });

  it("destroy() cleans up Redis connection", async () => {
    await new Promise((resolve) => setTimeout(resolve, 50));

    const initialQuitCount = globalQuitCount;
    await client.destroy();

    const finalQuitCount = globalQuitCount;
    expect(finalQuitCount).toBeGreaterThan(initialQuitCount);
  });

  it("memory eviction triggers when store exceeds max entries", async () => {
    await new Promise((resolve) => setTimeout(resolve, 50));
    globalShouldFail = true;

    await client.set("key1", "value1", 60);
    await client.set("key2", "value2", 60);
    await client.set("key3", "value3", 60);

    expect(await client.get("key1")).toBe("value1");

    await client.set("key4", "value4", 60);

    const results = await Promise.all([
      client.get("key1"),
      client.get("key2"),
      client.get("key3"),
      client.get("key4"),
    ]);

    const nonNullCount = results.filter((r) => r !== null).length;
    expect(nonNullCount).toBe(3);
  });
});
