import { z } from 'zod';

export const envSchema = z.object({
  // Runtime
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
  PORT: z.coerce.number().default(8080),

  // Database
  DATABASE_URL: z.url(
    'DATABASE_URL must be a valid PostgreSQL connection string',
  ),

  // Redis Configuration
  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.coerce.number().default(6379),
  REDIS_PASSWORD: z.string().optional(),
  REDIS_TLS: z.coerce.boolean().default(false),

  // Queue Configuration
  QUEUE_DEFAULT_ATTEMPTS: z.coerce.number().default(3),
  QUEUE_BACKOFF_DELAY: z.coerce.number().default(1000),

  // JWT Authentication
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_ACCESS_EXPIRES: z.string().default('15m'),
  JWT_REFRESH_EXPIRES: z.string().default('7d'),

  // OAuth Providers (optional)
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),

  // App URLs
  APP_URL: z.url().default('http://localhost:8080'),
  FRONTEND_URL: z.url().default('http://localhost:3000'),

  // Feature Flags
  ENABLE_SWAGGER: z.coerce.boolean().default(true),

  // Storage Configuration (R2/S3)
  STORAGE_PROVIDER: z.enum(['r2', 's3', 'backblaze']).default('r2'),
  STORAGE_ENDPOINT: z.url(), // e.g., https://<account>.r2.cloudflarestorage.com
  STORAGE_REGION: z.string().default('auto'),
  STORAGE_ACCESS_KEY_ID: z.string(),
  STORAGE_SECRET_ACCESS_KEY: z.string(),
  STORAGE_BUCKET: z.string(),
  STORAGE_PUBLIC_URL: z.url().optional(), // CDN URL if using custom domain

  // Email Configuration (Resend)
  RESEND_API_KEY: z.string().optional(), // Optional in dev mode
  EMAIL_FROM: z.string().default('Clipaf <noreply@clipaf.com>'),
});

export type Env = z.infer<typeof envSchema>;
