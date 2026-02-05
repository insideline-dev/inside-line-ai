import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class CacheService implements OnModuleDestroy {
  private readonly logger = new Logger(CacheService.name);
  private readonly redis: Redis;

  constructor(private config: ConfigService) {
    const redisUrl = this.config.get<string>('REDIS_URL');

    if (redisUrl) {
      // ioredis can parse Redis URL directly
      this.redis = new Redis(redisUrl);
    } else {
      // Fallback to individual env vars (legacy)
      this.redis = new Redis({
        host: this.config.get('REDIS_HOST', 'localhost'),
        port: this.config.get('REDIS_PORT', 6379),
        password: this.config.get('REDIS_PASSWORD'),
        tls: this.config.get('REDIS_TLS') ? {} : undefined,
      });
    }

    this.redis.on('error', (err) => {
      this.logger.error('Redis connection error', err);
    });
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      const value = await this.redis.get(key);
      return value ? JSON.parse(value) : null;
    } catch {
      this.logger.warn(`Cache get failed for key: ${key}`);
      return null;
    }
  }

  async set(key: string, value: unknown, ttlSeconds = 300): Promise<void> {
    try {
      await this.redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
    } catch {
      this.logger.warn(`Cache set failed for key: ${key}`);
    }
  }

  async del(key: string): Promise<void> {
    try {
      await this.redis.del(key);
    } catch {
      this.logger.warn(`Cache delete failed for key: ${key}`);
    }
  }

  async onModuleDestroy() {
    await this.redis.quit();
  }
}
