import { Injectable, Logger, OnModuleDestroy, Optional } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
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
import { RedisFallbackClient } from "./redis-fallback.service";
import { AiDebugLogService } from "./ai-debug-log.service";

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
  private readonly redisClient: RedisFallbackClient;

  constructor(
    private config: ConfigService,
    @Optional() private aiDebugLog?: AiDebugLogService,
  ) {
    this.redisClient = new RedisFallbackClient({
      redisUrl: this.config.get<string>("REDIS_URL", "redis://localhost:6379"),
      recoveryIntervalMs: this.config.get<number>(
        "AI_PIPELINE_REDIS_RECOVERY_INTERVAL_MS",
        30_000,
      ),
      maxMemoryEntries: this.config.get<number>(
        "AI_PIPELINE_MEMORY_MAX_ENTRIES",
        2000,
      ),
      loggerContext: "PipelineStateRedis",
    });
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

    if (status === PhaseStatus.FAILED) {
      await this.aiDebugLog?.logPhaseFailure({
        startupId,
        pipelineRunId: current.pipelineRunId,
        phase,
        error,
      });
    }
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

  async setPipelineRunId(startupId: string, pipelineRunId: string): Promise<void> {
    const current = await this.requireState(startupId);
    const now = new Date().toISOString();
    current.pipelineRunId = pipelineRunId;
    current.status = PipelineStatus.RUNNING;
    current.quality = "standard";
    current.telemetry.startedAt = now;
    current.telemetry.completedAt = undefined;
    current.telemetry.totalDurationMs = undefined;
    current.updatedAt = now;
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

  async resetPhase(startupId: string, phase: PipelinePhase): Promise<void> {
    const current = await this.requireState(startupId);
    current.phases[phase] = { status: PhaseStatus.PENDING };
    current.telemetry.phases[phase] = {
      phase,
      agentCount: 0,
      successCount: 0,
      failedCount: 0,
    };
    current.updatedAt = new Date().toISOString();
    await this.persist(current);
  }

  async resetPhaseStatus(
    startupId: string,
    phase: PipelinePhase,
    status: PhaseStatus = PhaseStatus.PENDING,
  ): Promise<void> {
    const current = await this.requireState(startupId);
    current.phases[phase] = { status };
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
    await this.aiDebugLog?.logPhaseResult({
      startupId,
      pipelineRunId: current.pipelineRunId,
      phase,
      result,
    });
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
    await this.redisClient.del(this.getKey(startupId));
  }

  async onModuleDestroy() {
    await this.redisClient.destroy();
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
    const json = await this.redisClient.get(key);
    if (!json) return null;

    const parsed = PipelineStateSchema.safeParse(JSON.parse(json));
    if (!parsed.success) {
      this.logger.warn(`Corrupt pipeline state for ${key}: ${parsed.error.message}`);
      return null;
    }
    return parsed.data as PipelineState;
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
    await this.redisClient.set(key, JSON.stringify(state), this.getTtlSeconds());
  }
}
