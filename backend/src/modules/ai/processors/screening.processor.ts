import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { eq } from "drizzle-orm";
import { Job } from "bullmq";
import {
  AiScreeningJobData,
  AiScreeningJobResult,
} from "../../../queue/interfaces";
import { QUEUE_CONCURRENCY, QUEUE_NAMES } from "../../../queue";
import {
  BaseProcessor,
  parseRedisUrl,
} from "../../../queue/processors/base.processor";
import { DrizzleService } from "../../../database";
import { NotificationGateway } from "../../../notification/notification.gateway";
import { startup } from "../../startup/entities";
import { startupLensResult } from "../entities";
import { PipelinePhase } from "../interfaces/pipeline.interface";
import type {
  ScreeningLensSummary,
  ScreeningResult,
} from "../interfaces/phase-results.interface";
import { LensRegistryService } from "../lenses/lens-registry.service";
import type { LensInput } from "../schemas/lens";
import { ScreeningOutputService } from "../contracts/screening-output";
import { ScreeningTriageService } from "../screening/triage";
import { PipelineStateService } from "../services/pipeline-state.service";
import { PipelineService } from "../services/pipeline.service";
import { runPipelinePhase } from "./run-phase.util";

@Injectable()
export class ScreeningProcessor
  extends BaseProcessor<AiScreeningJobData, AiScreeningJobResult>
  implements OnModuleInit, OnModuleDestroy
{
  protected readonly logger = new Logger(ScreeningProcessor.name);

  constructor(
    config: ConfigService,
    private lensRegistry: LensRegistryService,
    private drizzle: DrizzleService,
    private pipelineState: PipelineStateService,
    private pipelineService: PipelineService,
    private notificationGateway: NotificationGateway,
    private screeningOutput: ScreeningOutputService,
    private screeningTriage: ScreeningTriageService,
  ) {
    const redisUrl = config.get<string>("REDIS_URL", "redis://localhost:6379");
    const queuePrefix = config.get<string>("QUEUE_PREFIX");
    super(
      QUEUE_NAMES.AI_SCREENING,
      parseRedisUrl(redisUrl),
      QUEUE_CONCURRENCY[QUEUE_NAMES.AI_SCREENING],
      queuePrefix,
    );
  }

  async onModuleInit() {
    await this.initialize();
    if (!this.worker) {
      this.logger.warn(
        "ScreeningProcessor initialized without an active worker; recovery will retry automatically.",
      );
      return;
    }
    this.logger.log(
      `✅ ScreeningProcessor ready | Queue: ${QUEUE_NAMES.AI_SCREENING} | Concurrency: ${QUEUE_CONCURRENCY[QUEUE_NAMES.AI_SCREENING]}`,
    );
  }

  async onModuleDestroy() {
    await this.close();
  }

  protected override async onWorkerStalled(
    job: Job<AiScreeningJobData>,
  ): Promise<void> {
    const { startupId, pipelineRunId, userId } = job.data;
    await this.pipelineService.recordInfrastructureIssue({
      startupId,
      pipelineRunId,
      userId,
      phase: PipelinePhase.SCREENING,
      stepKey: "worker_stalled",
      error: `BullMQ worker marked screening job ${job.id} as stalled`,
      failureSource: "worker_stalled",
      meta: {
        queueName: QUEUE_NAMES.AI_SCREENING,
        jobId: String(job.id),
        jobType: job.data.type,
      },
    });
  }

  protected async process(
    job: Job<AiScreeningJobData>,
  ): Promise<Omit<AiScreeningJobResult, "jobId" | "duration" | "success">> {
    const { startupId, pipelineRunId } = job.data;

    if (job.data.type !== "ai_screening") {
      throw new Error("Invalid job type for screening processor");
    }

    // Lenses are <30s each; with concurrency 3 the phase should land well under
    // the 3-minute budget. Heartbeat once a minute as a safety net so the
    // BullMQ stall watcher doesn't fire if a single lens drags.
    const HEARTBEAT_MS = 60 * 1000;
    const LOCK_DURATION_MS = 5 * 60 * 1000;
    const heartbeat = setInterval(() => {
      job.extendLock(job.token!, LOCK_DURATION_MS).catch((err: unknown) => {
        this.logger.warn(
          `[ScreeningProcessor] Failed to extend job lock: ${err instanceof Error ? err.message : String(err)}`,
        );
      });
    }, HEARTBEAT_MS);

    let runResult: Awaited<ReturnType<typeof runPipelinePhase>>;
    try {
      runResult = await runPipelinePhase({
        job,
        phase: PipelinePhase.SCREENING,
        jobType: "ai_screening",
        pipelineState: this.pipelineState,
        pipelineService: this.pipelineService,
        notificationGateway: this.notificationGateway,
        run: () => this.runScreening(startupId, pipelineRunId),
      });
    } finally {
      clearInterval(heartbeat);
    }

    return {
      type: "ai_screening",
      startupId: runResult.startupId,
      pipelineRunId: runResult.pipelineRunId,
      data: runResult.result,
    };
  }

  /** Public so unit tests can drive the screening flow without BullMQ. */
  async runScreening(
    startupId: string,
    pipelineRunId: string,
  ): Promise<ScreeningResult> {
    const ctx = await this.buildContext(startupId);
    const results = await this.lensRegistry.runAll(ctx);

    const lenses: ScreeningLensSummary[] = [];
    const failedKeys: string[] = [];

    for (const key of this.lensRegistry.keys()) {
      const result = results[key];
      if (!result) {
        failedKeys.push(key);
        continue;
      }

      lenses.push({
        key: result.key,
        score: result.output.score,
        signal: result.output.signal,
        rationale: result.output.rationale,
        modelId: result.modelId,
        promptKey: result.promptKey,
        latencyMs: result.latencyMs,
        usedFallback: result.usedFallback,
        error: result.error,
      });

      if (result.usedFallback) {
        failedKeys.push(key);
      }

      try {
        await this.drizzle.db.insert(startupLensResult).values({
          startupId,
          pipelineRunId,
          lensKey: result.key,
          score: result.output.score,
          signal: result.output.signal,
          rationale: result.output.rationale,
          evidence: result.output.evidence,
          modelId: result.modelId,
          promptKey: result.promptKey,
          latencyMs: result.latencyMs,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.warn(
          `[ScreeningProcessor] Persist failed for lens '${result.key}' on ${startupId}: ${message}`,
        );
      }
    }

    // Deal-level triage (DS-E7-F1-S1). Combine the lens signals into a single
    // ADVANCE / REVIEW / REJECT classification so investors only manually
    // triage the REVIEW bucket. Triage failures must never break screening;
    // the lens rows are the source of truth and the decision can be recomputed.
    try {
      const decision = await this.screeningTriage.decide({
        startupId,
        pipelineRunId,
        lensResults: lenses.map(({ key, score, signal }) => ({
          key,
          score,
          signal,
        })),
      });
      this.logger.log(
        `[ScreeningProcessor] Triage v${decision.policyVersion} for ${startupId}: ${decision.classification}@${decision.overallScore}`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `[ScreeningProcessor] Triage decide failed for ${startupId}: ${message}`,
      );
    }

    // Smoke-test the public ScreeningOutput contract on every run. Failures
    // here must never break screening — DD has its own failure surface.
    try {
      const contract = await this.screeningOutput.buildForStartup(
        startupId,
        pipelineRunId,
      );
      this.logger.debug(
        `[ScreeningProcessor] ScreeningOutput v${contract.version} for ${startupId} run=${pipelineRunId}: overall=${contract.overall.signal}@${contract.overall.score} lenses=${contract.lenses.length}`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `[ScreeningProcessor] ScreeningOutput build failed for ${startupId}: ${message}`,
      );
    }

    return { lenses, failedKeys };
  }

  private async buildContext(startupId: string): Promise<LensInput> {
    const [row] = await this.drizzle.db
      .select({
        id: startup.id,
        name: startup.name,
        description: startup.description,
        productDescription: startup.productDescription,
        industry: startup.industry,
        sectorIndustry: startup.sectorIndustry,
        stage: startup.stage,
      })
      .from(startup)
      .where(eq(startup.id, startupId))
      .limit(1);

    if (!row) {
      throw new Error(`Startup ${startupId} not found for screening`);
    }

    return {
      startupId,
      startupName: row.name,
      startupDescription: row.productDescription ?? row.description ?? "",
      sector: row.sectorIndustry ?? row.industry ?? "",
      stage: row.stage ?? "",
      contextNotes: "",
    };
  }
}
