import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class CacheService implements OnModuleDestroy {
  private readonly logger = new Logger(CacheService.name);
  private redis: Redis | null = null;
  private readonly memory = new Map<string, { value: string; expiresAt: number }>();
  private useMemory = false;

  constructor(private config: ConfigService) {
    const redisUrl = this.config.get<string>('REDIS_URL');

    try {
      const redis = redisUrl
        ? new Redis(redisUrl, { lazyConnect: true, maxRetriesPerRequest: 1, retryStrategy: () => null })
        : new Redis({
            host: this.config.get('REDIS_HOST', 'localhost'),
            port: this.config.get('REDIS_PORT', 6379),
            password: this.config.get('REDIS_PASSWORD'),
            tls: this.config.get('REDIS_TLS') ? {} : undefined,
            lazyConnect: true,
            maxRetriesPerRequest: 1,
            retryStrategy: () => null,
          });

      redis.on('error', () => {
        if (!this.useMemory) {
          this.logger.warn('Redis unavailable, falling back to in-memory cache');
          this.useMemory = true;
        }
      });

      redis.connect().then(() => {
        this.redis = redis;
        this.logger.log('Redis connected');
      }).catch(() => {
        this.useMemory = true;
        this.logger.warn('Redis unavailable, using in-memory cache');
      });
    } catch {
      this.useMemory = true;
      this.logger.warn('Redis init failed, using in-memory cache');
    }
  }

  async get<T>(key: string): Promise<T | null> {
    if (this.useMemory || !this.redis) {
      return this.memGet<T>(key);
    }
    try {
      const value = await this.redis.get(key);
      return value ? JSON.parse(value) : null;
    } catch {
      return this.memGet<T>(key);
    }
  }

  async set(key: string, value: unknown, ttlSeconds = 300): Promise<void> {
    const json = JSON.stringify(value);

    // Always set in memory as backup
    this.memory.set(key, { value: json, expiresAt: Date.now() + ttlSeconds * 1000 });

    if (!this.useMemory && this.redis) {
      try {
        await this.redis.set(key, json, 'EX', ttlSeconds);
      } catch {
        // memory fallback already set above
      }
    }
  }

  async del(key: string): Promise<void> {
    this.memory.delete(key);
    if (!this.useMemory && this.redis) {
      try {
        await this.redis.del(key);
      } catch {
        // noop
      }
    }
  }

  async onModuleDestroy() {
    if (this.redis) {
      await this.redis.quit().catch(() => {});
    }
  }

  private memGet<T>(key: string): T | null {
    const entry = this.memory.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.memory.delete(key);
      return null;
    }
    return JSON.parse(entry.value);
  }
}
