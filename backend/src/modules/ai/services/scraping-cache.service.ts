import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHash } from "crypto";
import type { WebsiteScrapedData } from "../interfaces/phase-results.interface";
import { RedisFallbackClient } from "./redis-fallback.service";

@Injectable()
export class ScrapingCacheService implements OnModuleDestroy {
  private readonly logger = new Logger(ScrapingCacheService.name);
  private readonly redisClient: RedisFallbackClient;

  constructor(private config: ConfigService) {
    this.redisClient = new RedisFallbackClient({
      redisUrl: this.config.get<string>("REDIS_URL", "redis://localhost:6379"),
      recoveryIntervalMs: this.config.get<number>(
        "SCRAPING_CACHE_REDIS_RECOVERY_INTERVAL_MS",
        30_000,
      ),
      maxMemoryEntries: this.config.get<number>(
        "SCRAPING_MEMORY_CACHE_MAX_ENTRIES",
        5000,
      ),
      loggerContext: "ScrapingCacheRedis",
    });
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
    await this.redisClient.destroy();
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
    const value = await this.redisClient.get(key);
    return value ? (JSON.parse(value) as T) : null;
  }

  private async setCache(key: string, data: unknown, ttlSeconds: number): Promise<void> {
    if (ttlSeconds <= 0) {
      return;
    }
    await this.redisClient.set(key, JSON.stringify(data), ttlSeconds);
  }
}
