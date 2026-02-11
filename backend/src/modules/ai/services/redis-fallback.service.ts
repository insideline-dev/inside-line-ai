import { Logger } from "@nestjs/common";
import Redis from "ioredis";

interface MemoryEntry {
  value: string;
  expiresAt: number;
  lastAccessedAt: number;
}

export interface RedisFallbackOptions {
  redisUrl: string;
  recoveryIntervalMs: number;
  maxMemoryEntries: number;
  loggerContext: string;
}

export class RedisFallbackClient {
  private readonly logger: Logger;
  private redis: Redis | null = null;
  private useMemory = false;
  private reconnectInFlight = false;
  private lastRecoveryAttemptAt = 0;
  private readonly memoryStore = new Map<string, MemoryEntry>();

  constructor(private readonly options: RedisFallbackOptions) {
    this.logger = new Logger(options.loggerContext);
    this.initializeRedis();
  }

  async get(key: string): Promise<string | null> {
    this.tryRecovery();

    if (this.useMemory || !this.redis) {
      return this.readMemory(key);
    }

    try {
      return await this.redis.get(key);
    } catch (error) {
      this.markRedisUnavailable(`redis read failed: ${String(error)}`);
      return this.readMemory(key);
    }
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    this.writeMemory(key, value, ttlSeconds);
    this.tryRecovery();

    if (this.useMemory || !this.redis) {
      return;
    }

    try {
      await this.redis.set(key, value, "EX", ttlSeconds);
    } catch (error) {
      this.markRedisUnavailable(`redis write failed: ${String(error)}`);
    }
  }

  async del(key: string): Promise<void> {
    this.memoryStore.delete(key);

    if (!this.useMemory && this.redis) {
      try {
        await this.redis.del(key);
      } catch (error) {
        this.logger.warn(`Redis del failed for ${key}: ${String(error)}`);
      }
    }
  }

  async destroy(): Promise<void> {
    if (this.redis) {
      await this.redis.quit().catch(() => undefined);
      this.redis = null;
    }
  }

  private initializeRedis(): void {
    try {
      const redis = new Redis(this.options.redisUrl, {
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        retryStrategy: () => null,
      });

      redis
        .connect()
        .then(() => {
          this.redis = redis;
          this.useMemory = false;
          this.logger.log("Redis connected");
        })
        .catch((error) => {
          this.markRedisUnavailable(`initial connect failed: ${String(error)}`);
        });

      redis.on("error", (error) => {
        this.markRedisUnavailable(`redis error: ${String(error)}`);
      });
    } catch {
      this.markRedisUnavailable("redis init failed");
    }
  }

  private tryRecovery(): void {
    if (this.useMemory) {
      this.attemptRedisRecovery().catch((err) =>
        this.logger.debug(`Redis recovery failed: ${String(err)}`),
      );
    }
  }

  private markRedisUnavailable(reason: string): void {
    if (!this.useMemory) {
      this.logger.warn(`Switching to memory fallback: ${reason}`);
    }
    this.useMemory = true;
  }

  private async attemptRedisRecovery(): Promise<void> {
    if (!this.useMemory || this.reconnectInFlight) {
      return;
    }

    const now = Date.now();
    if (now - this.lastRecoveryAttemptAt < this.options.recoveryIntervalMs) {
      return;
    }

    this.reconnectInFlight = true;
    this.lastRecoveryAttemptAt = now;

    try {
      const oldRedis = this.redis;
      this.redis = null;
      if (oldRedis) {
        await oldRedis.quit().catch(() => undefined);
      }

      const redis = new Redis(this.options.redisUrl, {
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        retryStrategy: () => null,
      });
      redis.on("error", (error) => {
        this.markRedisUnavailable(`redis error: ${String(error)}`);
      });
      await redis.connect();
      this.redis = redis;
      this.useMemory = false;
      this.logger.log("Redis recovered");
    } catch (error) {
      this.logger.warn(`Redis recovery failed: ${String(error)}`);
      this.useMemory = true;
    } finally {
      this.reconnectInFlight = false;
    }
  }

  private writeMemory(key: string, value: string, ttlSeconds: number): void {
    const now = Date.now();
    this.memoryStore.set(key, {
      value,
      expiresAt: now + ttlSeconds * 1000,
      lastAccessedAt: now,
    });
    this.evictIfNeeded();
  }

  private readMemory(key: string): string | null {
    const entry = this.memoryStore.get(key);
    if (!entry) return null;

    if (entry.expiresAt <= Date.now()) {
      this.memoryStore.delete(key);
      return null;
    }

    entry.lastAccessedAt = Date.now();
    return entry.value;
  }

  private evictIfNeeded(): void {
    while (this.memoryStore.size > this.options.maxMemoryEntries) {
      let oldestKey: string | undefined;
      let oldestAccess = Infinity;

      for (const [key, entry] of this.memoryStore) {
        if (entry.lastAccessedAt < oldestAccess) {
          oldestAccess = entry.lastAccessedAt;
          oldestKey = key;
        }
      }

      if (!oldestKey) return;
      this.memoryStore.delete(oldestKey);
    }
  }
}
