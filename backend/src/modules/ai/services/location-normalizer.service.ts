import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Redis from "ioredis";
import { generateObject } from "ai";
import { z } from "zod";
import { ModelPurpose } from "../interfaces/pipeline.interface";
import { AiProviderService } from "../providers/ai-provider.service";

const NormalizedRegionSchema = z.object({
  region: z.enum(["us", "europe", "latam", "asia", "mena", "global"]),
});

export type NormalizedRegion = z.infer<typeof NormalizedRegionSchema>["region"];

@Injectable()
export class LocationNormalizerService implements OnModuleDestroy {
  private readonly logger = new Logger(LocationNormalizerService.name);
  private readonly memoryCache = new Map<string, NormalizedRegion>();
  private readonly ttlSeconds = 30 * 24 * 60 * 60;
  private redis: Redis | null = null;
  private redisDisabled = false;

  constructor(
    private providers: AiProviderService,
    private config: ConfigService,
  ) {
    this.initializeRedis();
  }

  async normalize(location: string): Promise<NormalizedRegion> {
    const key = this.toCacheKey(location);
    if (!key) {
      return "global";
    }

    const memoryHit = this.memoryCache.get(key);
    if (memoryHit) {
      return memoryHit;
    }

    const redisHit = await this.getRedisCachedRegion(key);
    if (redisHit) {
      this.memoryCache.set(key, redisHit);
      return redisHit;
    }

    try {
      const { object } = await generateObject({
        model: this.providers.resolveModelForPurpose(
          ModelPurpose.LOCATION_NORMALIZATION,
        ),
        schema: NormalizedRegionSchema,
        temperature: 0,
        maxOutputTokens: 64,
        prompt: [
          "Map the startup location to exactly one region enum value.",
          "Valid regions: us, europe, latam, asia, mena, global.",
          `Location: ${location}`,
        ].join("\n"),
      });

      const parsed = NormalizedRegionSchema.parse(object);
      await this.cacheRegion(key, parsed.region);
      return parsed.region;
    } catch (error) {
      const fallback = this.fallbackRegion(location);
      await this.cacheRegion(key, fallback);

      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Location normalization fallback for "${location}": ${message}`,
      );
      return fallback;
    }
  }

  async onModuleDestroy() {
    if (this.redis) {
      await this.redis.quit().catch(() => undefined);
    }
  }

  private toCacheKey(location: string): string {
    return location.trim().toLowerCase();
  }

  private async cacheRegion(
    key: string,
    region: NormalizedRegion,
  ): Promise<void> {
    this.memoryCache.set(key, region);

    if (!this.redis || this.redisDisabled) {
      return;
    }

    try {
      await this.redis.set(this.redisKey(key), region, "EX", this.ttlSeconds);
    } catch {
      this.redisDisabled = true;
    }
  }

  private async getRedisCachedRegion(
    key: string,
  ): Promise<NormalizedRegion | null> {
    if (!this.redis || this.redisDisabled) {
      return null;
    }

    try {
      const cached = await this.redis.get(this.redisKey(key));
      if (!cached) {
        return null;
      }

      const parsed = NormalizedRegionSchema.safeParse({ region: cached });
      return parsed.success ? parsed.data.region : null;
    } catch {
      this.redisDisabled = true;
      return null;
    }
  }

  private redisKey(key: string): string {
    return `location:normalized:${key}`;
  }

  private initializeRedis(): void {
    const redisUrl = this.config.get<string>("REDIS_URL");
    if (!redisUrl) {
      this.redisDisabled = true;
      return;
    }

    try {
      const client = new Redis(redisUrl, {
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        retryStrategy: () => null,
      });

      client
        .connect()
        .then(() => {
          this.redis = client;
        })
        .catch(() => {
          this.redisDisabled = true;
        });

      client.on("error", () => {
        this.redisDisabled = true;
      });
    } catch {
      this.redisDisabled = true;
    }
  }

  private fallbackRegion(location: string): NormalizedRegion {
    const value = location.toLowerCase();

    if (
      /(united states|usa|us|new york|san francisco|los angeles|austin|bay area|california|texas)/.test(
        value,
      )
    ) {
      return "us";
    }

    if (
      /(united kingdom|uk|england|london|france|germany|spain|italy|netherlands|europe|emea)/.test(
        value,
      )
    ) {
      return "europe";
    }

    if (
      /(brazil|mexico|argentina|chile|colombia|latam|latin america)/.test(value)
    ) {
      return "latam";
    }

    if (
      /(singapore|india|japan|china|korea|asia|hong kong|australia|new zealand)/.test(
        value,
      )
    ) {
      return "asia";
    }

    if (
      /(uae|dubai|saudi|qatar|egypt|morocco|mena|middle east|north africa)/.test(
        value,
      )
    ) {
      return "mena";
    }

    return "global";
  }
}
