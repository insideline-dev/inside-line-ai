import { Logger } from "@nestjs/common";
import Redis from "ioredis";

const TRANSIENT_REDIS_ERROR_PATTERNS = [
  "connection is closed",
  "connection closed",
  "econnreset",
  "econnrefused",
  "etimedout",
  "socket hang up",
];

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
  private redisInitPromise: Promise<void>;
  private redisInitResolve!: () => void;

  constructor(private readonly options: RedisFallbackOptions) {
    this.logger = new Logger(options.loggerContext);
    this.redisInitPromise = new Promise((resolve) => {
      this.redisInitResolve = resolve;
    });
    this.initializeRedis();
  }

  async get(key: string): Promise<string | null> {
    // Wait for Redis initialization before deciding whether to use Redis
    await this.redisInitPromise;
    this.tryRecovery();

    if (this.useMemory || !this.redis) {
      return this.readMemory(key);
    }

    try {
      const result = await this.redis.get(key);
      // Fall back to memory if Redis returns null — key may have been written during fallback
      return result ?? this.readMemory(key);
    } catch (error) {
      this.markRedisUnavailable(`redis read failed: ${String(error)}`);
      return this.readMemory(key);
    }
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    this.writeMemory(key, value, ttlSeconds);

    // Wait for Redis initialization before deciding whether to use Redis
    await this.redisInitPromise;
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
        const message = String(error);
        if (this.isTransientRedisError(message)) {
          this.logger.debug(`Redis del failed for ${key}: ${message}`);
        } else {
          this.logger.warn(`Redis del failed for ${key}: ${message}`);
        }
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
      const redis = this.createRedisClient();

      redis
        .connect()
        .then(async () => {
          this.redis = redis;
          this.useMemory = false;
          this.logger.log("Redis connected");
          await this.syncMemoryToRedis();
          this.redisInitResolve(); // Signal that Redis is ready
        })
        .catch((error) => {
          this.markRedisUnavailable(`initial connect failed: ${String(error)}`);
          this.redisInitResolve(); // Signal that we're falling back to memory
        });
    } catch {
      this.markRedisUnavailable("redis init failed");
      this.redisInitResolve(); // Signal that we're falling back to memory
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
        if (typeof oldRedis.removeAllListeners === "function") {
          oldRedis.removeAllListeners("error");
        }
        await oldRedis.quit().catch(() => undefined);
      }

      const redis = this.createRedisClient();
      await redis.connect();
      this.redis = redis;
      this.useMemory = false;
      this.logger.log("Redis recovered");
      await this.syncMemoryToRedis();
    } catch (error) {
      const message = String(error);
      if (this.isTransientRedisError(message)) {
        this.logger.debug(`Redis recovery failed: ${message}`);
      } else {
        this.logger.warn(`Redis recovery failed: ${message}`);
      }
      this.useMemory = true;
    } finally {
      this.reconnectInFlight = false;
    }
  }

  private createRedisClient(): Redis {
    const redis = new Redis(this.options.redisUrl, {
      lazyConnect: true,
      maxRetriesPerRequest: null,
      connectTimeout: 10_000,
      keepAlive: 30_000,
      retryStrategy: (attempt) => Math.min(Math.max(attempt, 1) * 100, 2000),
      reconnectOnError: () => true,
    });

    redis.on("error", (error) => {
      if (this.isBenignConnectionCloseError(error)) {
        return;
      }
      this.markRedisUnavailable(`redis error: ${String(error)}`);
    });

    return redis;
  }

  private isBenignConnectionCloseError(error: unknown): boolean {
    const message = String(error).toLowerCase();
    return (
      message.includes("connection is closed") ||
      message.includes("connection closed")
    );
  }

  private isTransientRedisError(message: string): boolean {
    const normalized = message.toLowerCase();
    return TRANSIENT_REDIS_ERROR_PATTERNS.some((pattern) =>
      normalized.includes(pattern),
    );
  }

  private async syncMemoryToRedis(): Promise<void> {
    if (!this.redis || this.memoryStore.size === 0) return;
    const now = Date.now();
    let synced = 0;
    for (const [key, entry] of this.memoryStore) {
      if (entry.expiresAt <= now) continue;
      const remainingTtl = Math.ceil((entry.expiresAt - now) / 1000);
      try {
        await this.redis.set(key, entry.value, "EX", remainingTtl);
        synced++;
      } catch {
        break;
      }
    }
    if (synced > 0) {
      this.logger.log(`Synced ${synced} entries from memory to Redis`);
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
