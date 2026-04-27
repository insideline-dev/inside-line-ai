import { z } from "zod";

export const envSchema = z.object({
  // Runtime
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  PORT: z.coerce.number().default(8080),

  // Database
  DATABASE_URL: z
    .string()
    .url("DATABASE_URL must be a valid PostgreSQL connection string"),
  DEV_DATABASE_URL: z.string().url().optional(), // Overrides DATABASE_URL when NODE_ENV=development
  DB_POOL_MAX: z.coerce.number().int().positive().default(20),
  DB_CONNECT_TIMEOUT_SECONDS: z.coerce.number().positive().default(10),
  DB_IDLE_TIMEOUT_SECONDS: z.coerce.number().positive().default(30),
  DB_MAX_LIFETIME_SECONDS: z.coerce.number().positive().default(1800),
  DB_DISABLE_PREPARE_FOR_POOLER: z.coerce.boolean().default(true),

  // Redis Configuration (use REDIS_URL, or fallback to individual vars)
  REDIS_URL: z.string().default("redis://localhost:6379"),
  REDIS_HOST: z.string().optional(),
  REDIS_PORT: z.coerce.number().optional(),
  REDIS_USERNAME: z.string().optional(),
  REDIS_PASSWORD: z.string().optional(),
  REDIS_TLS: z.coerce.boolean().optional(),

  // Queue Configuration
  QUEUE_DEFAULT_ATTEMPTS: z.coerce.number().default(3),
  QUEUE_BACKOFF_DELAY: z.coerce.number().default(1000),
  QUEUE_MAX_DEPTH_TASK: z.coerce.number().default(1000),
  QUEUE_MAX_PER_USER_TASK: z.coerce.number().default(20),
  QUEUE_MAX_DEPTH_AI_EXTRACTION: z.coerce.number().default(500),
  QUEUE_MAX_PER_USER_AI_EXTRACTION: z.coerce.number().default(5),
  QUEUE_MAX_DEPTH_AI_ENRICHMENT: z.coerce.number().default(500),
  QUEUE_MAX_PER_USER_AI_ENRICHMENT: z.coerce.number().default(5),
  QUEUE_MAX_DEPTH_AI_SCRAPING: z.coerce.number().default(500),
  QUEUE_MAX_PER_USER_AI_SCRAPING: z.coerce.number().default(5),
  QUEUE_MAX_DEPTH_AI_RESEARCH: z.coerce.number().default(500),
  QUEUE_MAX_PER_USER_AI_RESEARCH: z.coerce.number().default(5),
  QUEUE_MAX_DEPTH_AI_EVALUATION: z.coerce.number().default(500),
  QUEUE_MAX_PER_USER_AI_EVALUATION: z.coerce.number().default(5),
  QUEUE_MAX_DEPTH_AI_SYNTHESIS: z.coerce.number().default(500),
  QUEUE_MAX_PER_USER_AI_SYNTHESIS: z.coerce.number().default(5),
  QUEUE_MAX_DEPTH_AI_MATCHING: z.coerce.number().default(500),
  QUEUE_MAX_PER_USER_AI_MATCHING: z.coerce.number().default(5),
  QUEUE_PREFIX: z.string().trim().optional(),
  AI_QUEUE_CONCURRENCY_EXTRACTION: z.coerce.number().default(4),
  AI_QUEUE_CONCURRENCY_ENRICHMENT: z.coerce.number().default(4),
  AI_QUEUE_CONCURRENCY_SCRAPING: z.coerce.number().default(4),
  AI_QUEUE_CONCURRENCY_RESEARCH: z.coerce.number().default(6),
  AI_QUEUE_CONCURRENCY_EVALUATION: z.coerce.number().default(8),
  AI_QUEUE_CONCURRENCY_SYNTHESIS: z.coerce.number().default(2),
  AI_QUEUE_CONCURRENCY_MATCHING: z.coerce.number().default(3),
  AI_EXTRACTION_CONCURRENCY: z.coerce.number().optional(),
  AI_RESEARCH_CONCURRENCY: z.coerce.number().optional(),
  AI_EVALUATION_CONCURRENCY: z.coerce.number().optional(),
  AI_PIPELINE_TIMEOUT: z.coerce.number().default(600000),
  AI_MAX_RETRIES: z.coerce.number().default(3),
  AI_PIPELINE_MEMORY_MAX_ENTRIES: z.coerce.number().default(2000),
  AI_PIPELINE_REDIS_RECOVERY_INTERVAL_MS: z.coerce.number().default(30000),

  // JWT Authentication
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
  JWT_ACCESS_EXPIRES: z.string().default("15m"),
  JWT_REFRESH_EXPIRES: z.string().default("30d"),
  // App URLs
  APP_URL: z.string().url().default("http://localhost:8080"),
  FRONTEND_URL: z.string().url().default("http://localhost:3030"),
  PUPPETEER_EXECUTABLE_PATH: z.string().optional(),

  // Feature Flags
  ENABLE_SWAGGER: z.coerce.boolean().default(true),
  DEV_EXPOSE_TOKENS: z.coerce.boolean().default(false),
  LOG_TO_FILE: z.coerce.boolean().default(true),
  LOG_FILE_PATH: z.string().default("logs/backend.jsonl"),
  LOG_CONTEXT_FILES_ENABLED: z.coerce.boolean().default(true),
  LOG_CONTEXT_FILES_DIR: z.string().default("logs/contexts"),
  LOG_RUN_FILES_ENABLED: z.coerce.boolean().default(true),
  LOG_RUN_FILES_DIR: z.string().default("logs/runs"),
  LOG_MAX_FILE_SIZE: z.coerce.number().default(52428800), // 50 MB

  // Storage Configuration (R2/S3)
  STORAGE_PROVIDER: z.enum(["r2", "s3", "backblaze"]).default("r2"),
  STORAGE_ENDPOINT: z.string().url(), // e.g., https://<account>.r2.cloudflarestorage.com
  STORAGE_REGION: z.string().default("auto"),
  STORAGE_ACCESS_KEY_ID: z.string(),
  STORAGE_SECRET_ACCESS_KEY: z.string(),
  STORAGE_BUCKET: z.string(),
  STORAGE_PUBLIC_URL: z.union([z.string().url(), z.literal("")]).optional(), // CDN URL if using custom domain

  // Email Configuration (Resend)
  RESEND_API_KEY: z.string().optional(), // Optional in dev mode
  EMAIL_FROM: z.string().default("Inside Line <noreply@insideline.com>"),

  // Twilio Configuration
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_WHATSAPP_NUMBER: z.string().optional(),

  // Evolution WhatsApp Integration
  EVOLUTION_API_URL: z.string().url().optional(),
  EVOLUTION_API_KEY: z.string().optional(),
  EVOLUTION_INSTANCE_NAME: z.string().optional(),
  EVOLUTION_INSTANCE_API_KEY: z.string().optional(),
  EVOLUTION_WEBHOOK_SECRET: z.string().optional(),

  // AgentMail Integration
  AGENTMAIL_WEBHOOK_SECRET: z.string().optional(),
  AGENTMAIL_API_KEY: z.string().optional(),
  // Clara email assistant routing
  CLARA_INBOX_ID: z.string().optional(),
  CLARA_ADMIN_USER_ID: z.string().optional(),
  // Comma-separated list of additional email addresses treated as Clara-originated (e.g. "clara@insideline.ai,clara@example.com")
  CLARA_EMAIL_ALIASES: z.string().optional(),

  // Unipile Integration (LinkedIn)
  UNIPILE_DSN: z.string().optional(),
  UNIPILE_API_KEY: z.string().optional(),
  UNIPILE_ACCOUNT_ID: z.string().optional(),
  WEBSITE_SCRAPE_TIMEOUT_MS: z.coerce.number().default(30000),
  LINKEDIN_BATCH_SIZE: z.coerce.number().default(10),
  LINKEDIN_COMPANY_DISCOVERY_MAX: z.coerce.number().default(6),
  SCRAPING_RATE_LIMIT_MS: z.coerce.number().default(1000),
  SCRAPING_MAX_SUBPAGES: z.coerce.number().default(20),
  SCRAPING_BATCH_SIZE: z.coerce.number().default(5),
  SCRAPING_DISCOVERY_ENABLED: z.coerce.boolean().default(true),
  WEBSITE_CACHE_TTL_HOURS: z.coerce.number().default(24),
  LINKEDIN_CACHE_TTL_DAYS: z.coerce.number().default(7),
  AI_SCRAPING_DEBUG_LOG_ENABLED: z.coerce.boolean().default(true),
  AI_SCRAPING_DEBUG_LOG_PATH: z
    .string()
    .default("logs/ai-scraping-debug.jsonl"),
  AI_AGENT_DEBUG_LOG_ENABLED: z.coerce.boolean().default(true),
  AI_AGENT_DEBUG_LOG_PATH: z.string().default("logs/ai-agent-debug.jsonl"),
  AI_AGENT_TRACE_RETENTION_DAYS: z.coerce.number().default(30),
  AI_PROMPT_STRICT_DB_REQUIRED: z.coerce.boolean().default(false),
  SCRAPING_MAX_LINKS_PER_PAGE: z.coerce.number().default(100),
  SCRAPING_MAX_PATH_DEPTH: z.coerce.number().default(4),
  SCRAPING_BATCH_DELAY_MS: z.coerce.number().default(500),
  SCRAPER_USER_AGENT: z.string().default("Mozilla/5.0 (compatible; InsideLine/1.0; +https://insideline.ai)"),
  SCRAPING_MEMORY_CACHE_MAX_ENTRIES: z.coerce.number().default(5000),
  SCRAPING_CACHE_REDIS_RECOVERY_INTERVAL_MS: z.coerce.number().default(30000),

  // AI Providers
  OPENAI_API_KEY: z.string().optional(),
  MISTRAL_API_KEY: z.string().optional(), // For OCR
  BRAVE_SEARCH_API_KEY: z.string().optional(),
  AI_PIPELINE_ENABLED: z.coerce.boolean().default(true),
  AI_PROMPT_RUNTIME_CONFIG_ENABLED: z.coerce.boolean().default(false),
  AI_PIPELINE_EDGE_DRIVEN_ENABLED: z.coerce.boolean().default(false),
  AI_EDGE_DRIVEN_EVAL_INPUTS: z.coerce.boolean().default(false),
  AI_PIPELINE_TTL_SECONDS: z.coerce.number().default(86400),
  // Defaults match `ai.config.ts` / OpenAI-first stack — no Google API key required unless you switch models to Gemini.
  AI_MODEL_EXTRACTION: z.string().default("gpt-5.4-mini"),
  AI_MODEL_RESEARCH: z.string().default("gpt-5.4-mini"),
  AI_MODEL_EVALUATION: z.string().default("gpt-5.4-mini"),
  AI_MODEL_SYNTHESIS: z.string().default("gpt-5.4"),
  AI_MODEL_THESIS_ALIGNMENT: z.string().default("gpt-5.4-mini"),
  AI_MODEL_LOCATION_NORMALIZATION: z.string().default("gpt-5.4-mini"),
  AI_MODEL_OCR: z.string().default("mistral-ocr-latest"),
  AI_MODEL_CLARA: z.string().default("gpt-4o"),
  AI_MODEL_ENRICHMENT: z.string().default("gpt-5.4-mini"),
  AI_ENRICHMENT_ENABLED: z.coerce.boolean().default(true),
  AI_SOURCE_SANITIZATION_ENABLED: z.coerce.boolean().default(true),
  LINKEDIN_AI_VERIFIER_ENABLED: z.coerce.boolean().default(true),
  LINKEDIN_AI_VERIFIER_MIN_CONFIDENCE: z.coerce.number().default(55),
  LINKEDIN_AI_VERIFIER_MAX_CONFIDENCE: z.coerce.number().default(80),
  AI_ENRICHMENT_TIMEOUT_MS: z.coerce.number().default(300000),
  ENRICHMENT_CORRECTION_CONFIDENCE_THRESHOLD: z.coerce.number().default(0.85),
  AI_RESEARCH_TEMPERATURE: z.coerce.number().default(0.2),
  AI_RESEARCH_TIMEOUT_MS: z.coerce.number().default(3600000),
  AI_RESEARCH_ATTEMPT_TIMEOUT_MS: z.coerce.number().default(3600000),
  AI_RESEARCH_MAX_ATTEMPTS: z.coerce.number().default(2),
  AI_RESEARCH_AGENT_HARD_TIMEOUT_MS: z.coerce.number().default(3600000),
  AI_RESEARCH_AGENT_STAGGER_MS: z.coerce.number().default(5000),

  AI_EVALUATION_AGENT_STAGGER_MS: z.coerce.number().default(5000),
  OPENAI_DEEP_RESEARCH_POLL_INTERVAL_MS: z.coerce.number().default(15000),
  AI_EVALUATION_TEMPERATURE: z.coerce.number().default(0.2),
  AI_EVALUATION_MAX_OUTPUT_TOKENS: z.coerce.number().default(8000),
  AI_EVALUATION_TIMEOUT_MS: z.coerce.number().default(300000),
  AI_EVALUATION_ATTEMPT_TIMEOUT_MS: z.coerce.number().default(300000),
  AI_EVALUATION_MAX_ATTEMPTS: z.coerce.number().default(2),
  AI_EVALUATION_AGENT_HARD_TIMEOUT_MS: z.coerce.number().default(7200000),
  AI_SYNTHESIS_TEMPERATURE: z.coerce.number().default(0.2),
  AI_SYNTHESIS_MAX_OUTPUT_TOKENS: z.coerce.number().default(50000),
  AI_SYNTHESIS_ATTEMPT_TIMEOUT_MS: z.coerce.number().default(10800000),
  AI_SYNTHESIS_AGENT_HARD_TIMEOUT_MS: z.coerce.number().default(10800000),
  AI_EXTRACTION_MAX_TEXT_CHARS: z.coerce.number().default(180000),
  AI_EXTRACTION_MAX_PDF_BYTES: z.coerce.number().default(104857600),
}).superRefine((env, ctx) => {
  if (env.NODE_ENV === "production" && !env.QUEUE_PREFIX) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["QUEUE_PREFIX"],
      message:
        "QUEUE_PREFIX is required in production to isolate BullMQ workers between environments",
    });
  }
});

export type Env = z.infer<typeof envSchema>;
