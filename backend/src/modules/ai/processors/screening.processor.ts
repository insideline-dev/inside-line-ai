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
import { MarketLens } from "../lenses/market.lens";
import { TeamLens } from "../lenses/team.lens";
import { TractionLens } from "../lenses/traction.lens";
import type { BaseLensAgent, LensRunResult } from "../lenses/base-lens.agent";
import {
  normalizeLensEvidenceLink,
  type LensInput,
  type LensOutput,
} from "../schemas/lens";

const LENS_RUN_CONCURRENCY = 3;
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

  /**
   * Lens agents run in parallel during screening. The list is explicit (no
   * registry indirection) so adding a lens means importing it here and
   * appending to the constructor's `lenses` initializer. Versioning lives at
   * the prompt-catalog layer (`activeVersion` on each prompt key), not at
   * the lens class layer.
   */
  private readonly lenses: ReadonlyArray<BaseLensAgent<LensOutput>>;

  constructor(
    config: ConfigService,
    market: MarketLens,
    team: TeamLens,
    traction: TractionLens,
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
    this.lenses = [market, team, traction];
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
    const { startupId, pipelineRunId, userId } = job.data;

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
        run: () =>
          this.runScreening(startupId, pipelineRunId, { userId }),
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

  /**
   * Run the registered lenses in parallel with bounded concurrency. Each lens
   * handles its own fallback so a single failure doesn't take the batch down;
   * a missing entry in the returned map signals an unrecoverable error.
   *
   * Emits per-lens agent progress events (`started` → `completed`/`fallback`)
   * via `pipelineService.onAgentProgress` so the admin pipeline-live view
   * can render lens-by-lens execution inside the SCREENING phase — same UX
   * pattern the research/evaluation phases already use.
   */
  private async runLenses(
    ctx: LensInput,
    progress?: { userId: string; pipelineRunId: string; startupId: string },
  ): Promise<Record<string, LensRunResult<LensOutput>>> {
    const out: Record<string, LensRunResult<LensOutput>> = {};
    let cursor = 0;
    const emit = async (
      key: string,
      lifecycle: "started" | "completed" | "fallback",
      usedFallback = false,
      errorMessage?: string,
    ): Promise<void> => {
      if (!progress) return;
      try {
        await this.pipelineService.onAgentProgress({
          startupId: progress.startupId,
          userId: progress.userId,
          pipelineRunId: progress.pipelineRunId,
          phase: PipelinePhase.SCREENING,
          key: `lens_${key}`,
          status: lifecycle === "started" ? "running" : "completed",
          progress: lifecycle === "started" ? 0 : 100,
          attempt: 1,
          retryCount: 0,
          phaseRetryCount: 0,
          usedFallback,
          error: errorMessage,
          lifecycleEvent: lifecycle,
        });
      } catch (err) {
        this.logger.warn(
          `Lens progress emit failed (${key} ${lifecycle}): ${(err as Error).message}`,
        );
      }
    };

    const next = async (): Promise<void> => {
      while (cursor < this.lenses.length) {
        const idx = cursor++;
        const lens = this.lenses[idx];
        await emit(lens.key, "started");
        try {
          const r = await lens.run(ctx);
          out[lens.key] = r;
          await emit(
            lens.key,
            r.usedFallback ? "fallback" : "completed",
            r.usedFallback,
            r.error,
          );
        } catch (err) {
          this.logger.error(
            `Lens ${lens.key} threw outside its fallback: ${(err as Error).message}`,
          );
          await emit(lens.key, "completed", true, (err as Error).message);
        }
      }
    };
    const workerCount = Math.min(LENS_RUN_CONCURRENCY, this.lenses.length);
    await Promise.all(Array.from({ length: workerCount }, () => next()));
    return out;
  }

  /** Public so unit tests can drive the screening flow without BullMQ. */
  async runScreening(
    startupId: string,
    pipelineRunId: string,
    progressContext?: { userId: string },
  ): Promise<ScreeningResult> {
    const ctx = await this.buildContext(startupId);
    const results = await this.runLenses(
      ctx,
      progressContext
        ? {
            userId: progressContext.userId,
            pipelineRunId,
            startupId,
          }
        : undefined,
    );

    const lenses: ScreeningLensSummary[] = [];
    const failedKeys: string[] = [];

    for (const lens of this.lenses) {
      const result = results[lens.key];
      if (!result) {
        failedKeys.push(lens.key);
        continue;
      }

      let normalizedEvidence: Array<
        LensOutput["evidence"][number] & {
          sourceType: "deck_page" | "public_url" | "enrichment_call" | "research_source" | "internal_trace";
          sourceLabel: string;
          sourceRef: string;
          url?: string;
          pageNumber?: number;
        }
      >;
      try {
        normalizedEvidence = result.output.evidence.map((item) => ({
          ...item,
          source: item.source.trim(),
          ...normalizeLensEvidenceLink(item.source),
        }));
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.warn(
          `[ScreeningProcessor] Rejecting lens '${result.key}' for ${startupId}: ${message}`,
        );
        failedKeys.push(lens.key);
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
        failedKeys.push(lens.key);
      }

      try {
        await this.drizzle.db.insert(startupLensResult).values({
          startupId,
          pipelineRunId,
          lensKey: result.key,
          score: result.output.score,
          signal: result.output.signal,
          rationale: result.output.rationale,
          evidence: normalizedEvidence,
          modelId: result.modelId,
          promptKey: result.promptKey,
          // DS-E2-F1-S2 — persist the version pair that produced this row so
          // historical decisions remain replayable when the active version
          // flips.
          lensVersion: result.lensVersion,
          promptVersion: result.promptVersion,
          latencyMs: result.latencyMs,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.warn(
          `[ScreeningProcessor] Persist failed for lens '${result.key}' on ${startupId}: ${message}`,
        );
      }
    }

    // DS-E2-F1-S2 — capture the active lens versions for this run so the
    // screening_decision row stays replayable independent of future env
    // flips. Built from the runResults (not registry.getActiveVersion) so
    // it reflects whatever version actually executed, even when run('team@2')
    // was explicitly targeted.
    const lensVersions: Record<string, string> = {};
    for (const result of Object.values(results)) {
      lensVersions[result.key] = result.lensVersion;
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
        // DS-E2-F1-S2 — persist the active lens versions alongside the
        // decision so historical replays know which lens code paths ran.
        lensVersions,
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

    // Pipeline state may not exist (e.g. dev-only rescreen-dev path that
    // bypasses the BullMQ pipeline). Treat that as "no synthesis yet"
    // rather than crashing the triage gate.
    let synthesis: SynthesisResult | null = null;
    try {
      synthesis = (await this.pipelineState.getPhaseResult(
        startupId,
        PipelinePhase.SYNTHESIS,
      )) as SynthesisResult | null;
    } catch (err) {
      this.logger.debug(
        `[ScreeningProcessor] No pipeline state for ${startupId}; thesis-fit gate remains unseeded (${err instanceof Error ? err.message : String(err)})`,
      );
      return null;
    }
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
        userId: startup.userId,
        teamMembers: startup.teamMembers,
      })
      .from(startup)
      .where(eq(startup.id, startupId))
      .limit(1);

    if (!row) {
      throw new Error(`Startup ${startupId} not found for screening`);
    }

    // Prefer the user-submitted `description` over the LLM-generated
    // `productDescription`. The latter has shown evidence of fabricating
    // content from unrelated startups during enrichment.
    const userDescription = (row.description ?? "").trim();
    const productDescription = (row.productDescription ?? "").trim();
    const startupDescription =
      userDescription.length > 0
        ? userDescription
        : productDescription;
    const contextNotes =
      userDescription.length > 0 && productDescription.length > 0
        ? `Additional system-extracted notes (treat as low-confidence): ${productDescription.slice(0, 400)}`
        : "";

    // Pull the investor thesis owned by the user who submitted this deal.
    // v2 lens prompts make thesis a first-class input; empty string is OK
    // (the prompt is calibrated to handle "no thesis on file").
    const investorThesis = await this.formatThesisForLens(row.userId);

    // Pre-format team roster for the Team lens.
    const teamMembers = this.formatTeamMembers(row.teamMembers);

    return {
      startupId,
      startupName: row.name,
      startupDescription,
      sector: row.sectorIndustry ?? row.industry ?? "",
      stage: row.stage ?? "",
      contextNotes,
      investorThesis,
      teamMembers,
    };
  }

  private async formatThesisForLens(userId: string | null): Promise<string> {
    if (!userId) return "";
    const [t] = await this.drizzle.db
      .select()
      .from(investorThesis)
      .where(eq(investorThesis.userId, userId))
      .limit(1);
    if (!t) return "";

    const lines: string[] = [];
    const push = (label: string, value: string | null | undefined) => {
      if (value && value.trim().length > 0) lines.push(`- ${label}: ${value}`);
    };
    const pushList = (label: string, value: string[] | null | undefined) => {
      if (value && value.length > 0) push(label, value.join(", "));
    };

    pushList("Sectors / industries", t.industries);
    pushList("Stages", t.stages);
    pushList("Geographic focus", t.geographicFocus);
    pushList("Business models", t.businessModels);
    if (t.checkSizeMin != null || t.checkSizeMax != null) {
      const min =
        t.checkSizeMin != null ? `$${t.checkSizeMin.toLocaleString()}` : "?";
      const max =
        t.checkSizeMax != null ? `$${t.checkSizeMax.toLocaleString()}` : "?";
      push("Check size range", `${min} – ${max}`);
    }
    pushList("Must-have features", t.mustHaveFeatures);
    pushList("Deal breakers", t.dealBreakers);
    if (t.minTeamSize != null) push("Min team size", String(t.minTeamSize));
    push("Narrative", t.thesisNarrative);

    return lines.length > 0
      ? lines.join("\n")
      : "(thesis row exists but no criteria set)";
  }

  private formatTeamMembers(
    members: Array<{ name?: string; role?: string; linkedinUrl?: string }> | null,
  ): string {
    if (!members || members.length === 0) return "";
    return members
      .filter((m) => m && (m.name || m.role || m.linkedinUrl))
      .map((m) => {
        const parts = [
          m.name?.trim() || "(unnamed)",
          m.role?.trim() ? `— ${m.role.trim()}` : "",
          m.linkedinUrl?.trim() ? `(${m.linkedinUrl.trim()})` : "",
        ].filter(Boolean);
        return `- ${parts.join(" ")}`;
      })
      .join("\n");
  }
}
