import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHash } from "crypto";
import Redis from "ioredis";
import type { WebsiteScrapedData } from "../interfaces/phase-results.interface";

@Injectable()
export class ScrapingCacheService implements OnModuleDestroy {
  private readonly logger = new Logger(ScrapingCacheService.name);
  private redis: Redis | null = null;
  private readonly redisUrl: string;
  private readonly redisRecoveryIntervalMs: number;
  private readonly maxMemoryEntries: number;
  private useMemory = false;
  private reconnectInFlight = false;
  private lastRecoveryAttemptAt = 0;
  private readonly memoryStore = new Map<
    string,
    { value: string; expiresAt: number }
  >();

  constructor(private config: ConfigService) {
    this.redisUrl = this.config.get<string>("REDIS_URL", "redis://localhost:6379");
    this.redisRecoveryIntervalMs = this.config.get<number>(
      "SCRAPING_CACHE_REDIS_RECOVERY_INTERVAL_MS",
      30_000,
    );
    this.maxMemoryEntries = this.config.get<number>(
      "SCRAPING_MEMORY_CACHE_MAX_ENTRIES",
      5000,
    );
    this.initializeRedis();
  }

  async getWebsiteCache<T extends WebsiteScrapedData = WebsiteScrapedData>(
    url: string,
  ): Promise<T | null> {
    return this.getCache<T>(this.getWebsiteCacheKey(url));
  }

  async setWebsiteCache(url: string, data: unknown): Promise<void> {
    await this.setCache(
      this.getWebsiteCacheKey(url),
      data,
      this.getWebsiteTtlSeconds(),
    );
  }

  async getLinkedinCache<T = unknown>(profileUrl: string): Promise<T | null> {
    return this.getCache<T>(this.getLinkedinCacheKey(profileUrl));
  }

  async setLinkedinCache(profileUrl: string, data: unknown): Promise<void> {
    await this.setCache(
      this.getLinkedinCacheKey(profileUrl),
      data,
      this.getLinkedinTtlSeconds(),
    );
  }

  async onModuleDestroy() {
    if (this.redis) {
      await this.redis.quit().catch(() => undefined);
    }
  }

  private initializeRedis() {
    try {
      const redis = new Redis(this.redisUrl, {
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        retryStrategy: () => null,
      });

      redis
        .connect()
        .then(() => {
          this.redis = redis;
          this.useMemory = false;
          this.logger.log("Scraping cache connected to Redis");
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

  private getWebsiteCacheKey(url: string): string {
    return `scrape:website:${this.hashUrl(url)}`;
  }

  private getLinkedinCacheKey(url: string): string {
    return `scrape:linkedin:${this.hashUrl(url)}`;
  }

  private hashUrl(url: string): string {
    const normalized = this.normalizeUrl(url);
    return createHash("sha256").update(normalized).digest("hex");
  }

  private normalizeUrl(url: string): string {
    const candidate = /^https?:\/\//i.test(url) ? url : `https://${url}`;

    try {
      const parsed = new URL(candidate);
      parsed.protocol = parsed.protocol.toLowerCase();
      parsed.hostname = parsed.hostname.toLowerCase();
      parsed.hash = "";

      if (parsed.pathname !== "/" && parsed.pathname.endsWith("/")) {
        parsed.pathname = parsed.pathname.slice(0, -1);
      }

      return parsed.toString();
    } catch {
      return candidate.toLowerCase().replace(/\/+$/, "");
    }
  }

  private getWebsiteTtlSeconds(): number {
    const hours = this.config.get<number>("WEBSITE_CACHE_TTL_HOURS", 24);
    if (!Number.isFinite(hours) || hours <= 0) {
      return 0;
    }
    return Math.floor(hours) * 60 * 60;
  }

  private getLinkedinTtlSeconds(): number {
    const days = this.config.get<number>("LINKEDIN_CACHE_TTL_DAYS", 7);
    if (!Number.isFinite(days) || days <= 0) {
      return 0;
    }
    return Math.floor(days) * 24 * 60 * 60;
  }

  private async getCache<T>(key: string): Promise<T | null> {
    if (this.useMemory) {
      void this.attemptRedisRecovery();
    }

    if (this.useMemory || !this.redis) {
      const value = this.readMemory(key);
      return value ? (JSON.parse(value) as T) : null;
    }

    try {
      const value = await this.redis.get(key);
      return value ? (JSON.parse(value) as T) : null;
    } catch (error) {
      this.logger.warn(`Redis cache read failed for key ${key}: ${String(error)}`);
      this.markRedisUnavailable("redis read failed");
      const fallback = this.readMemory(key);
      return fallback ? (JSON.parse(fallback) as T) : null;
    }
  }

  private async setCache(key: string, data: unknown, ttlSeconds: number): Promise<void> {
    if (ttlSeconds <= 0) {
      this.memoryStore.delete(key);
      return;
    }

    const value = JSON.stringify(data);
    this.writeMemory(key, value, ttlSeconds);

    if (this.useMemory) {
      void this.attemptRedisRecovery();
    }

    if (this.useMemory || !this.redis) {
      return;
    }

    try {
      await this.redis.set(key, value, "EX", ttlSeconds);
    } catch (error) {
      this.logger.warn(`Redis cache write failed for key ${key}: ${String(error)}`);
      this.markRedisUnavailable("redis write failed");
    }
  }

  private writeMemory(key: string, value: string, ttlSeconds: number): void {
    if (this.memoryStore.has(key)) {
      this.memoryStore.delete(key);
    }

    this.memoryStore.set(key, {
      value,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
    this.evictMemoryIfNeeded();
  }

  private readMemory(key: string): string | null {
    const entry = this.memoryStore.get(key);
    if (!entry) {
      return null;
    }

    if (entry.expiresAt <= Date.now()) {
      this.memoryStore.delete(key);
      return null;
    }

    // touch for LRU
    this.memoryStore.delete(key);
    this.memoryStore.set(key, entry);
    return entry.value;
  }

  private evictMemoryIfNeeded(): void {
    while (this.memoryStore.size > this.maxMemoryEntries) {
      const oldestKey = this.memoryStore.keys().next().value as string | undefined;
      if (!oldestKey) {
        return;
      }
      this.memoryStore.delete(oldestKey);
    }
  }

  private markRedisUnavailable(reason: string): void {
    if (!this.useMemory) {
      this.logger.warn(`Scraping cache switching to memory fallback: ${reason}`);
    }
    this.useMemory = true;
  }

  private async attemptRedisRecovery(): Promise<void> {
    if (!this.useMemory || this.reconnectInFlight) {
      return;
    }

    const now = Date.now();
    if (now - this.lastRecoveryAttemptAt < this.redisRecoveryIntervalMs) {
      return;
    }
    this.lastRecoveryAttemptAt = now;
    this.reconnectInFlight = true;

    try {
      if (this.redis) {
        await this.redis.quit().catch(() => undefined);
        this.redis = null;
      }

      const redis = new Redis(this.redisUrl, {
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
      this.logger.log("Scraping cache Redis recovered");
    } catch (error) {
      this.logger.warn(`Scraping cache Redis recovery failed: ${String(error)}`);
      this.useMemory = true;
    } finally {
      this.reconnectInFlight = false;
    }
  }
}
