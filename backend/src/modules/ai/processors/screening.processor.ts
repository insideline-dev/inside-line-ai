import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { and, desc, eq, inArray } from "drizzle-orm";
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
import { DealEventService } from "../../startup/deal-event.service";
import { user, UserRole } from "../../../auth/entities/auth.schema";
import { investorThesis, startupMatch } from "../../investor/entities/investor.schema";
import { startupLensResult } from "../entities";
import type { SynthesisResult } from "../interfaces/phase-results.interface";
import { InvestorMatchingService } from "../services/investor-matching.service";
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

/**
 * Project lens evidence into the minimal shape the triage policy needs.
 * Triage shouldn't see the raw evidence payload — it only cares whether
 * each item carries a confidence label, so a future lens schema change
 * doesn't ripple into the triage policy file.
 */
function projectEvidence(
  evidence: ReadonlyArray<{ confidence: "low" | "medium" | "high" }>,
): Array<{ confidence: "low" | "medium" | "high" }> {
  return evidence.map((e) => ({ confidence: e.confidence }));
}

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
    private dealEvents: DealEventService,
    private investorMatching: InvestorMatchingService,
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
          evidence: result.output.evidence.map((item) => ({
            ...item,
            source: item.source ?? undefined,
          })),
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

    let triageDecision:
      | {
          classification: "advance" | "review" | "reject";
          overallScore: number;
          reasonCodes: string[];
        }
      | null = null;

    // Deal-level triage (DS-E7-F1-S1 + DS-E7-F2-S1 + DS-E4-F1-S1).
    // Combine the lens signals into a single ADVANCE / REVIEW / REJECT
    // classification so investors only manually triage the REVIEW bucket.
    // - Evidence projection per lens enables the no-auto-advance-without-
    //   evidence pre-pass (DS-E7-F2-S1).
    // - Thesis-fit score (max across active investors, when known) enables
    //   the out-of-thesis-scope short-circuit (DS-E4-F1-S1).
    // Triage failures must never break screening; the lens rows are the
    // source of truth and the decision can be recomputed.
    try {
      const evidenceByKey = new Map<string, ReturnType<typeof projectEvidence>>(
        Object.values(results).map((r) => [
          r.key,
          projectEvidence(r.output.evidence),
        ]),
      );
      const thesisFitScore = await this.maxThesisFitScore(startupId);
      const decision = await this.screeningTriage.decide({
        startupId,
        pipelineRunId,
        lensResults: lenses.map(({ key, score, signal }) => ({
          key,
          score,
          signal,
          evidence: evidenceByKey.get(key),
        })),
        thesisFitScore,
      });
      triageDecision = {
        classification: decision.classification,
        overallScore: decision.overallScore,
        reasonCodes: decision.reasonCodes,
      };
      this.logger.log(
        `[ScreeningProcessor] Triage v${decision.policyVersion} for ${startupId}: ${decision.classification}@${decision.overallScore} (thesisFit=${thesisFitScore ?? "null"})`,
      );
      // DS-E8-F1-S1 — append-only audit event for the timeline UI.
      void this.dealEvents.record({
        startupId,
        type: "triage.decided",
        payload: {
          classification: decision.classification,
          overallScore: decision.overallScore,
          reasonCodes: decision.reasonCodes,
          policyVersion: decision.policyVersion,
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `[ScreeningProcessor] Triage decide failed for ${startupId}: ${message}`,
      );
    }

    // Smoke-test the public ScreeningOutput contract on every run. Failures
    // here must never break screening — DD has its own failure surface.
    let screeningContract:
      | Awaited<ReturnType<ScreeningOutputService["buildForStartup"]>>
      | null = null;
    try {
      screeningContract = await this.screeningOutput.buildForStartup(
        startupId,
        pipelineRunId,
      );
      this.logger.debug(
        `[ScreeningProcessor] ScreeningOutput v${screeningContract.version} for ${startupId} run=${pipelineRunId}: overall=${screeningContract.overall.signal}@${screeningContract.overall.score} lenses=${screeningContract.lenses.length}`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `[ScreeningProcessor] ScreeningOutput build failed for ${startupId}: ${message}`,
      );
    }

    // DS-E8-F1-S1 — phase-completion audit event. Recorded last so the
    // timeline reflects the order: lens persistence → triage → "screening
    // completed" milestone.
    void this.dealEvents.record({
      startupId,
      type: failedKeys.length > 0 ? "screening.failed" : "screening.completed",
      payload: {
        lensCount: lenses.length,
        failedKeys,
      },
    });

    return {
      lenses,
      failedKeys,
      classification:
        triageDecision?.classification ?? screeningContract?.overall.signal ?? "review",
      nextAction: screeningContract?.overall.nextAction,
      overallScore: triageDecision?.overallScore ?? screeningContract?.overall.score ?? 0,
      reasonCodes: triageDecision?.reasonCodes ?? [],
      missingMaterials:
        (screeningContract?.overall.missingMaterials as ScreeningResult["missingMaterials"]) ?? [],
    };
  }

  /**
   * Returns the highest `thesisFitScore` recorded across all investors for
   * this startup, or null if no matches exist yet.
   *
   * If the persisted matches are missing on a first run, we opportunistically
   * backfill them from the live investor-thesis pool and synthesis result so
   * the out-of-thesis gate can still make a truthful decision on that same
   * screening pass.
   */
  private async maxThesisFitScore(
    startupId: string,
  ): Promise<number | null> {
    const persistedScore = await this.getPersistedThesisFitScore(startupId);
    if (persistedScore !== null) {
      return persistedScore;
    }

    const hasActiveThesis = await this.hasActiveInvestorThesis();
    if (!hasActiveThesis) {
      return null;
    }

    const synthesis = (await this.pipelineState.getPhaseResult(
      startupId,
      PipelinePhase.SYNTHESIS,
    )) as SynthesisResult | null;
    if (!synthesis) {
      this.logger.debug(
        `[ScreeningProcessor] No synthesis result available yet for ${startupId}; thesis-fit gate remains unseeded`,
      );
      return null;
    }

    const startupForMatching = await this.loadStartupForMatching(startupId);
    if (!startupForMatching) {
      return null;
    }

    try {
      const seeded = await this.investorMatching.matchStartup({
        startupId,
        startup: startupForMatching,
        synthesis,
      });

      if (seeded.candidatesEvaluated === 0) {
        return 0;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `[ScreeningProcessor] Thesis-fit backfill failed for ${startupId}: ${message}`,
      );
      return null;
    }

    return this.getPersistedThesisFitScore(startupId);
  }

  private async getPersistedThesisFitScore(
    startupId: string,
  ): Promise<number | null> {
    const rows = await this.drizzle.db
      .select({ score: startupMatch.thesisFitScore })
      .from(startupMatch)
      .where(eq(startupMatch.startupId, startupId))
      .orderBy(desc(startupMatch.thesisFitScore))
      .limit(1);
    return rows[0]?.score ?? null;
  }

  private async hasActiveInvestorThesis(): Promise<boolean> {
    const rows = await this.drizzle.db
      .select({ userId: user.id })
      .from(user)
      .leftJoin(investorThesis, eq(investorThesis.userId, user.id))
      .where(
        and(
          inArray(user.role, [UserRole.INVESTOR, UserRole.ADMIN]),
          eq(investorThesis.isActive, true),
        ),
      )
      .limit(1);

    return rows.length > 0;
  }

  private async loadStartupForMatching(startupId: string): Promise<{
    industry: string;
    sectorIndustryGroup?: string | null;
    stage: string;
    fundingTarget?: number;
    location: string;
    geoPath?: string[] | null;
  } | null> {
    const [row] = await this.drizzle.db
      .select({
        industry: startup.industry,
        sectorIndustryGroup: startup.sectorIndustryGroup,
        stage: startup.stage,
        fundingTarget: startup.fundingTarget,
        location: startup.location,
        geoPath: startup.geoPath,
      })
      .from(startup)
      .where(eq(startup.id, startupId))
      .limit(1);

    return row ?? null;
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
