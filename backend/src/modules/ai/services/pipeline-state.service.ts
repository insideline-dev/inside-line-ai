import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Redis from "ioredis";
import { customAlphabet } from "nanoid";
import { z } from "zod";
import {
  AgentTelemetry,
  PhaseResult,
  PhaseResultMap,
  PhaseStatus,
  PipelinePhase,
  PipelineState,
  PipelineStatus,
} from "../interfaces/pipeline.interface";
import { AI_PIPELINE_REDIS_KEY_PREFIX } from "../ai.config";

const nanoid = customAlphabet("abcdefghijklmnopqrstuvwxyz0123456789", 16);

const PipelineStateSchema = z.object({
  pipelineRunId: z.string(),
  startupId: z.string(),
  userId: z.string(),
  status: z.nativeEnum(PipelineStatus),
  quality: z.enum(["standard", "degraded"]),
  currentPhase: z.nativeEnum(PipelinePhase),
  phases: z.record(z.nativeEnum(PipelinePhase), z.object({
    status: z.nativeEnum(PhaseStatus),
    startedAt: z.string().optional(),
    completedAt: z.string().optional(),
    error: z.string().optional(),
  })),
  results: z.record(z.string(), z.unknown()).default({}),
  retryCounts: z.record(z.string(), z.number()).default({}),
  telemetry: z.object({
    startedAt: z.string(),
    completedAt: z.string().optional(),
    totalDurationMs: z.number().optional(),
    totalTokens: z.object({
      input: z.number(),
      output: z.number(),
    }),
    totalCostUsd: z.number().optional(),
    bottleneckPhase: z.nativeEnum(PipelinePhase).optional(),
    bottleneckAgent: z.string().optional(),
    phases: z.record(z.nativeEnum(PipelinePhase), z.object({
      phase: z.nativeEnum(PipelinePhase),
      startedAt: z.string().optional(),
      completedAt: z.string().optional(),
      durationMs: z.number().optional(),
      agentCount: z.number(),
      successCount: z.number(),
      failedCount: z.number(),
    })),
    agents: z.record(z.string(), z.object({
      agentKey: z.string(),
      phase: z.nativeEnum(PipelinePhase),
      startedAt: z.string(),
      completedAt: z.string().optional(),
      durationMs: z.number().optional(),
      tokenUsage: z.object({
        input: z.number(),
        output: z.number(),
      }).optional(),
      model: z.string().optional(),
      retryCount: z.number(),
    })),
  }),
  createdAt: z.string(),
  updatedAt: z.string(),
});

@Injectable()
export class PipelineStateService implements OnModuleDestroy {
  private readonly logger = new Logger(PipelineStateService.name);
  private redis: Redis | null = null;
  private readonly redisUrl: string;
  private readonly redisRecoveryIntervalMs: number;
  private readonly maxMemoryEntries: number;
  private useMemory = false;
  private reconnectInFlight = false;
  private lastRecoveryAttemptAt = 0;
  private readonly memoryStore = new Map<
    string,
    { state: PipelineState; expiresAt: number }
  >();

  constructor(private config: ConfigService) {
    this.redisUrl = this.config.get<string>("REDIS_URL", "redis://localhost:6379");
    this.redisRecoveryIntervalMs = this.config.get<number>(
      "AI_PIPELINE_REDIS_RECOVERY_INTERVAL_MS",
      30_000,
    );
    this.maxMemoryEntries = this.config.get<number>(
      "AI_PIPELINE_MEMORY_MAX_ENTRIES",
      2000,
    );
    this.initializeRedis();
  }

  async init(
    startupId: string,
    userId: string,
    pipelineRunId = nanoid(),
  ): Promise<PipelineState> {
    const now = new Date().toISOString();
    const state: PipelineState = {
      pipelineRunId,
      startupId,
      userId,
      status: PipelineStatus.RUNNING,
      quality: "standard",
      currentPhase: PipelinePhase.EXTRACTION,
      phases: this.createInitialPhases(),
      results: {},
      retryCounts: {},
      telemetry: {
        startedAt: now,
        totalTokens: {
          input: 0,
          output: 0,
        },
        phases: {
          [PipelinePhase.EXTRACTION]: {
            phase: PipelinePhase.EXTRACTION,
            agentCount: 0,
            successCount: 0,
            failedCount: 0,
          },
          [PipelinePhase.SCRAPING]: {
            phase: PipelinePhase.SCRAPING,
            agentCount: 0,
            successCount: 0,
            failedCount: 0,
          },
          [PipelinePhase.RESEARCH]: {
            phase: PipelinePhase.RESEARCH,
            agentCount: 0,
            successCount: 0,
            failedCount: 0,
          },
          [PipelinePhase.EVALUATION]: {
            phase: PipelinePhase.EVALUATION,
            agentCount: 0,
            successCount: 0,
            failedCount: 0,
          },
          [PipelinePhase.SYNTHESIS]: {
            phase: PipelinePhase.SYNTHESIS,
            agentCount: 0,
            successCount: 0,
            failedCount: 0,
          },
        },
        agents: {},
      },
      createdAt: now,
      updatedAt: now,
    };

    await this.persist(state);
    return state;
  }

  async get(startupId: string): Promise<PipelineState | null> {
    return this.read(startupId);
  }

  async updatePhase(
    startupId: string,
    phase: PipelinePhase,
    status: PhaseStatus,
    error?: string,
  ): Promise<void> {
    const current = await this.requireState(startupId);
    const now = new Date().toISOString();

    const updatedPhase: PhaseResult = {
      ...current.phases[phase],
      status,
      error: error || undefined,
    };

    if (status === PhaseStatus.WAITING && !updatedPhase.startedAt) {
      current.currentPhase = phase;
    }

    if (status === PhaseStatus.RUNNING && !updatedPhase.startedAt) {
      updatedPhase.startedAt = now;
      current.currentPhase = phase;
      current.telemetry.phases[phase].startedAt = now;
    }

    if (
      status === PhaseStatus.COMPLETED ||
      status === PhaseStatus.FAILED ||
      status === PhaseStatus.SKIPPED
    ) {
      updatedPhase.completedAt = now;
      current.telemetry.phases[phase].completedAt = now;
      if (current.telemetry.phases[phase].startedAt) {
        current.telemetry.phases[phase].durationMs =
          new Date(now).getTime() -
          new Date(
            current.telemetry.phases[phase].startedAt as string,
          ).getTime();
      }
    }

    current.phases[phase] = updatedPhase;

    current.updatedAt = now;
    await this.persist(current);
  }

  async setStatus(startupId: string, status: PipelineStatus): Promise<void> {
    const current = await this.requireState(startupId);
    const now = new Date().toISOString();
    current.status = status;

    if (
      status === PipelineStatus.COMPLETED ||
      status === PipelineStatus.FAILED ||
      status === PipelineStatus.CANCELLED
    ) {
      current.telemetry.completedAt = now;
      current.telemetry.totalDurationMs =
        new Date(now).getTime() -
        new Date(current.telemetry.startedAt).getTime();
    }

    current.updatedAt = now;
    await this.persist(current);
  }

  async setQuality(
    startupId: string,
    quality: "standard" | "degraded",
  ): Promise<void> {
    const current = await this.requireState(startupId);
    current.quality = quality;
    current.updatedAt = new Date().toISOString();
    await this.persist(current);
  }

  async clearPhaseResult(startupId: string, phase: PipelinePhase): Promise<void> {
    const current = await this.requireState(startupId);
    delete current.results[phase];
    current.updatedAt = new Date().toISOString();
    await this.persist(current);
  }

  async incrementRetryCount(
    startupId: string,
    phase: PipelinePhase,
  ): Promise<number> {
    const current = await this.requireState(startupId);
    const next = (current.retryCounts[phase] ?? 0) + 1;
    current.retryCounts[phase] = next;
    current.updatedAt = new Date().toISOString();
    await this.persist(current);
    return next;
  }

  async resetRetryCount(startupId: string, phase: PipelinePhase): Promise<void> {
    const current = await this.requireState(startupId);
    current.retryCounts[phase] = 0;
    current.updatedAt = new Date().toISOString();
    await this.persist(current);
  }

  async setPhaseResult<P extends PipelinePhase>(
    startupId: string,
    phase: P,
    result: PhaseResultMap[P],
  ): Promise<void> {
    const current = await this.requireState(startupId);
    (current.results as Record<PipelinePhase, unknown>)[phase] = result;
    current.updatedAt = new Date().toISOString();
    await this.persist(current);
  }

  async getPhaseResult<P extends PipelinePhase>(
    startupId: string,
    phase: P,
  ): Promise<PhaseResultMap[P] | null> {
    const current = await this.requireState(startupId);
    return (current.results[phase] as PhaseResultMap[P] | undefined) ?? null;
  }

  async recordAgentTelemetry(
    startupId: string,
    telemetry: AgentTelemetry,
  ): Promise<void> {
    const current = await this.requireState(startupId);
    current.telemetry.agents[telemetry.agentKey] = telemetry;

    const phaseMetrics = current.telemetry.phases[telemetry.phase];
    phaseMetrics.agentCount += 1;
    if (telemetry.completedAt) {
      phaseMetrics.successCount += 1;
    }

    if (telemetry.tokenUsage) {
      current.telemetry.totalTokens.input += telemetry.tokenUsage.input;
      current.telemetry.totalTokens.output += telemetry.tokenUsage.output;
    }

    current.updatedAt = new Date().toISOString();
    await this.persist(current);
  }

  async clear(startupId: string): Promise<void> {
    const key = this.getKey(startupId);
    this.memoryStore.delete(key);

    if (!this.useMemory && this.redis) {
      try {
        await this.redis.del(key);
      } catch (error) {
        this.logger.warn(
          `Failed to clear Redis pipeline state for startup ${startupId}: ${String(error)}`,
        );
      }
    }
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
          this.logger.log("Pipeline state Redis connected");
        })
        .catch((error) => {
          this.markRedisUnavailable(
            `initial connect failed: ${String(error)}`,
          );
        });

      redis.on("error", (error) => {
        this.markRedisUnavailable(`redis error: ${String(error)}`);
      });
    } catch {
      this.markRedisUnavailable("redis init failed");
    }
  }

  private createInitialPhases(): Record<PipelinePhase, PhaseResult> {
    return {
      [PipelinePhase.EXTRACTION]: { status: PhaseStatus.PENDING },
      [PipelinePhase.SCRAPING]: { status: PhaseStatus.PENDING },
      [PipelinePhase.RESEARCH]: { status: PhaseStatus.PENDING },
      [PipelinePhase.EVALUATION]: { status: PhaseStatus.PENDING },
      [PipelinePhase.SYNTHESIS]: { status: PhaseStatus.PENDING },
    };
  }

  private getTtlSeconds(): number {
    return this.config.get<number>("AI_PIPELINE_TTL_SECONDS", 86400);
  }

  private getKey(startupId: string): string {
    return `${AI_PIPELINE_REDIS_KEY_PREFIX}:${startupId}`;
  }

  private async read(startupId: string): Promise<PipelineState | null> {
    const key = this.getKey(startupId);

    if (this.useMemory) {
      void this.attemptRedisRecovery();
    }

    if (this.useMemory || !this.redis) {
      return this.readMemory(key);
    }

    try {
      const json = await this.redis.get(key);
      if (!json) return null;
      const parsed = PipelineStateSchema.safeParse(JSON.parse(json));
      if (!parsed.success) {
        this.logger.warn(`Corrupt pipeline state in Redis for ${key}: ${parsed.error.message}`);
        return null;
      }
      return parsed.data as PipelineState;
    } catch (error) {
      this.markRedisUnavailable(`redis read failed: ${String(error)}`);
      return this.readMemory(key);
    }
  }

  private async requireState(startupId: string): Promise<PipelineState> {
    const state = await this.read(startupId);
    if (!state) {
      throw new Error(`Pipeline state for startup ${startupId} not found`);
    }

    return state;
  }

  private async persist(state: PipelineState): Promise<void> {
    const key = this.getKey(state.startupId);
    this.writeMemory(key, state);

    if (this.useMemory) {
      void this.attemptRedisRecovery();
    }

    if (this.useMemory || !this.redis) {
      return;
    }

    try {
      await this.redis.set(
        key,
        JSON.stringify(state),
        "EX",
        this.getTtlSeconds(),
      );
    } catch (error) {
      this.markRedisUnavailable(`redis write failed: ${String(error)}`);
    }
  }

  private writeMemory(key: string, state: PipelineState): void {
    if (this.memoryStore.has(key)) {
      this.memoryStore.delete(key);
    }

    this.memoryStore.set(key, {
      state,
      expiresAt: Date.now() + this.getTtlSeconds() * 1000,
    });
    this.evictMemoryIfNeeded();
  }

  private readMemory(key: string): PipelineState | null {
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
    return entry.state;
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
      this.logger.warn(`Pipeline state using memory fallback: ${reason}`);
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
      this.logger.log("Pipeline state Redis recovered");
    } catch (error) {
      this.logger.warn(`Pipeline state Redis recovery failed: ${String(error)}`);
      this.useMemory = true;
    } finally {
      this.reconnectInFlight = false;
    }
  }
}
