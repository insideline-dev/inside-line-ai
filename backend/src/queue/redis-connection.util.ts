import type { ConnectionOptions } from "bullmq";
import type { RedisOptions } from "ioredis";

const DEFAULT_REDIS_PORT = 6379;
const MAX_RETRY_DELAY_MS = 2000;

interface RedisFallbackConfig {
  host?: string;
  port?: number;
  username?: string;
  password?: string;
  tls?: boolean;
}

function parseDbIndex(pathname: string): number | undefined {
  const trimmed = pathname.replace(/^\/+/, "");
  if (!trimmed) return undefined;

  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return undefined;
  }

  return parsed;
}

export function buildBullRedisConnection(
  redisUrl?: string,
  fallback?: RedisFallbackConfig,
): ConnectionOptions {
  const base: RedisOptions = {
    maxRetriesPerRequest: null,
    connectTimeout: 10_000,
    keepAlive: 30_000,
    retryStrategy: (attempt) =>
      Math.min(Math.max(attempt, 1) * 100, MAX_RETRY_DELAY_MS),
  };

  if (redisUrl) {
    try {
      const url = new URL(redisUrl);
      return {
        ...base,
        host: url.hostname,
        port: Number.parseInt(url.port || String(DEFAULT_REDIS_PORT), 10),
        username: url.username || undefined,
        password: url.password || undefined,
        db: parseDbIndex(url.pathname),
        tls: url.protocol === "rediss:" ? {} : undefined,
      };
    } catch {
      // Fall through to legacy env vars when URL parsing fails.
    }
  }

  return {
    ...base,
    host: fallback?.host ?? "localhost",
    port: fallback?.port ?? DEFAULT_REDIS_PORT,
    username: fallback?.username,
    password: fallback?.password,
    tls: fallback?.tls ? {} : undefined,
  };
}

