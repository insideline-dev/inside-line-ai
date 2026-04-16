import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { desc, eq, and } from "drizzle-orm";
import { DrizzleService } from "../../../database";
import { QueueService, QUEUE_NAMES } from "../../../queue";
import type { AiMatchingJobData } from "../../../queue/interfaces";
import { NotificationService } from "../../../notification/notification.service";
import { NotificationType } from "../../../notification/entities";
import { startup, StartupStatus } from "../../startup/entities/startup.schema";
import { user, UserRole } from "../../../auth/entities/auth.schema";
import { scoutSubmission } from "../../scout/entities/scout.schema";
import {
  analysisJob,
  AnalysisJobPriority,
  AnalysisJobStatus,
  AnalysisJobType,
  startupEvaluation,
} from "../../analysis/entities";
import type { SynthesisResult } from "../interfaces/phase-results.interface";
import { InvestorMatchingService } from "./investor-matching.service";

type MatchingTriggerSource = "approval" | "manual" | "retry" | "pipeline_completion" | "thesis_update";

export interface QueueStartupMatchingParams {
  startupId: string;
  requestedBy: string;
  triggerSource: MatchingTriggerSource;
  requireApproved?: boolean;
}

export interface QueueStartupMatchingResult {
  startupId: string;
  analysisJobId: string;
  queueJobId: string;
  status: "queued";
  triggerSource: MatchingTriggerSource;
}

export interface StartupMatchingStatusResponse {
  startupId: string;
  status: AnalysisJobStatus | "not_started";
  jobId: string | null;
  triggerSource?: MatchingTriggerSource;
  queueJobId?: string;
  createdAt?: string;
  startedAt?: string | null;
  completedAt?: string | null;
  error?: string | null;
  result?: {
    triggerSource: MatchingTriggerSource;
    candidatesEvaluated: number;
    matchesFound: number;
    failedCandidates: number;
    notificationsSent: number;
    notificationError?: string;
  };
}

@Injectable()
export class StartupMatchingPipelineService {
  private readonly logger = new Logger(StartupMatchingPipelineService.name);

  constructor(
    private drizzle: DrizzleService,
    private queue: QueueService,
    private investorMatching: InvestorMatchingService,
    private notificationService: NotificationService,
  ) {}

  async queueStartupMatching(
    params: QueueStartupMatchingParams,
  ): Promise<QueueStartupMatchingResult> {
    const requireApproved = params.requireApproved ?? true;
    const startupRecord = await this.loadStartup(params.startupId);

    if (requireApproved && startupRecord.status !== StartupStatus.APPROVED) {
      throw new BadRequestException(
        `Startup must be approved before matching. Current status: ${startupRecord.status}`,
      );
    }

    const [createdJob] = await this.drizzle.db
      .insert(analysisJob)
      .values({
        startupId: params.startupId,
        jobType: AnalysisJobType.MATCHING,
        status: AnalysisJobStatus.PENDING,
        priority: AnalysisJobPriority.MEDIUM,
        result: {
          triggerSource: params.triggerSource,
          requestedBy: params.requestedBy,
        },
      })
      .returning();

    try {
      const queueJobId = await this.queue.addJob(
        QUEUE_NAMES.AI_MATCHING,
        {
          type: "ai_matching",
          startupId: params.startupId,
          analysisJobId: createdJob.id,
          triggerSource: params.triggerSource,
          userId: params.requestedBy,
          priority: 2,
        },
        {
          priority: 2,
          attempts: 3,
        },
      );

      await this.drizzle.db
        .update(analysisJob)
        .set({
          result: {
            triggerSource: params.triggerSource,
            requestedBy: params.requestedBy,
            queueJobId,
          },
        })
        .where(eq(analysisJob.id, createdJob.id));

      return {
        startupId: params.startupId,
        analysisJobId: createdJob.id,
        queueJobId,
        status: "queued",
        triggerSource: params.triggerSource,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.drizzle.db
        .update(analysisJob)
        .set({
          status: AnalysisJobStatus.FAILED,
          errorMessage: message,
          completedAt: new Date(),
        })
        .where(eq(analysisJob.id, createdJob.id));
      throw error;
    }
  }

  async getLatestMatchingStatus(
    startupId: string,
  ): Promise<StartupMatchingStatusResponse> {
    await this.loadStartup(startupId);

    const [latest] = await this.drizzle.db
      .select()
      .from(analysisJob)
      .where(
        and(
          eq(analysisJob.startupId, startupId),
          eq(analysisJob.jobType, AnalysisJobType.MATCHING),
        ),
      )
      .orderBy(desc(analysisJob.createdAt))
      .limit(1);

    if (!latest) {
      return {
        startupId,
        status: "not_started",
        jobId: null,
      };
    }

    const parsedResult = this.parseMatchingResult(latest.result);
    const triggerSource =
      parsedResult?.triggerSource ??
      this.parseTriggerSourceFromResult(latest.result);

    return {
      startupId,
      status: latest.status,
      jobId: latest.id,
      triggerSource,
      queueJobId: this.parseQueueJobIdFromResult(latest.result),
      createdAt: latest.createdAt.toISOString(),
      startedAt: latest.startedAt?.toISOString() ?? null,
      completedAt: latest.completedAt?.toISOString() ?? null,
      error: latest.errorMessage ?? null,
      result: parsedResult ?? undefined,
    };
  }

  async processMatchingJob(
    jobData: AiMatchingJobData,
  ): Promise<{
    triggerSource: MatchingTriggerSource;
    candidatesEvaluated: number;
    matchesFound: number;
    failedCandidates: number;
    notificationsSent: number;
    notificationError?: string;
  }> {
    this.logger.log(
      `Processing matching job: startupId=${jobData.startupId} userId=${jobData.userId} triggerSource=${jobData.triggerSource}`,
    );
    const startedAt = new Date();
    await this.drizzle.db
      .update(analysisJob)
      .set({
        status: AnalysisJobStatus.PROCESSING,
        startedAt,
        errorMessage: null,
      })
      .where(eq(analysisJob.id, jobData.analysisJobId));

    try {
      const startupRecord = await this.loadStartup(jobData.startupId);
      const synthesis = await this.loadSynthesisFromDb(jobData.startupId);

      if (!synthesis) {
        throw new BadRequestException(
          `Cannot match startup (status: ${startupRecord.status}) — run AI analysis first so evaluation data is available.`,
        );
      }

      const restrictToInvestorId =
        await this.resolveRestrictToInvestorId(startupRecord);
      const forceIncludeInvestorId = await this.resolveForceIncludeInvestorId(
        jobData.userId,
        restrictToInvestorId,
      );

      const matching = await this.investorMatching.matchStartup({
        startupId: jobData.startupId,
        startup: {
          industry: startupRecord.industry,
          sectorIndustryGroup: startupRecord.sectorIndustryGroup,
          stage: startupRecord.stage,
          fundingTarget: startupRecord.fundingTarget,
          location: startupRecord.location ?? "",
          geoPath: startupRecord.geoPath ?? null,
        },
        synthesis: synthesis as SynthesisResult,
        forceIncludeInvestorId,
        restrictToInvestorId,
      });

      let notificationsSent = 0;
      let notificationError: string | undefined;

      if (matching.matches.length > 0) {
        try {
          await this.notificationService.createBulk(
            matching.matches.map((match) => ({
              userId: match.investorId,
              title: "New Startup Match",
              message: `A startup matched your thesis with ${match.thesisFitScore}% alignment.`,
              type: NotificationType.MATCH,
              link: `/investor/startup/${jobData.startupId}`,
            })),
          );
          notificationsSent = matching.matches.length;
        } catch (error) {
          notificationError =
            error instanceof Error ? error.message : String(error);
          this.logger.error(
            `Notification dispatch failed for startup ${jobData.startupId}: ${notificationError}`,
          );
        }
      }

      const result = {
        triggerSource: jobData.triggerSource,
        candidatesEvaluated: matching.candidatesEvaluated,
        matchesFound: matching.matches.length,
        failedCandidates: matching.failedCandidates,
        notificationsSent,
        ...(notificationError ? { notificationError } : {}),
      };

      await this.drizzle.db
        .update(analysisJob)
        .set({
          status: AnalysisJobStatus.COMPLETED,
          completedAt: new Date(),
          result,
          errorMessage: null,
        })
        .where(eq(analysisJob.id, jobData.analysisJobId));

      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.drizzle.db
        .update(analysisJob)
        .set({
          status: AnalysisJobStatus.FAILED,
          completedAt: new Date(),
          errorMessage: message,
        })
        .where(eq(analysisJob.id, jobData.analysisJobId));
      throw error;
    }
  }

  private parseMatchingResult(value: unknown):
    | {
        triggerSource: MatchingTriggerSource;
        candidatesEvaluated: number;
        matchesFound: number;
        failedCandidates: number;
        notificationsSent: number;
        notificationError?: string;
      }
    | null {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return null;
    }

    const record = value as Record<string, unknown>;
    const triggerSource = record.triggerSource;
    const candidatesEvaluated = record.candidatesEvaluated;
    const matchesFound = record.matchesFound;
    const failedCandidates = record.failedCandidates;
    const notificationsSent = record.notificationsSent;

    if (
      (triggerSource !== "approval" &&
        triggerSource !== "manual" &&
        triggerSource !== "retry" &&
        triggerSource !== "pipeline_completion" &&
        triggerSource !== "thesis_update") ||
      typeof candidatesEvaluated !== "number" ||
      typeof matchesFound !== "number" ||
      typeof failedCandidates !== "number" ||
      typeof notificationsSent !== "number"
    ) {
      return null;
    }

    return {
      triggerSource,
      candidatesEvaluated,
      matchesFound,
      failedCandidates,
      notificationsSent,
      ...(typeof record.notificationError === "string"
        ? { notificationError: record.notificationError }
        : {}),
    };
  }

  private parseTriggerSourceFromResult(
    value: unknown,
  ): MatchingTriggerSource | undefined {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return undefined;
    }
    const triggerSource = (value as Record<string, unknown>).triggerSource;
    if (
      triggerSource === "approval" ||
      triggerSource === "manual" ||
      triggerSource === "retry" ||
      triggerSource === "pipeline_completion" ||
      triggerSource === "thesis_update"
    ) {
      return triggerSource;
    }
    return undefined;
  }

  private parseQueueJobIdFromResult(value: unknown): string | undefined {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return undefined;
    }
    const queueJobId = (value as Record<string, unknown>).queueJobId;
    return typeof queueJobId === "string" ? queueJobId : undefined;
  }

  private async loadSynthesisFromDb(startupId: string): Promise<SynthesisResult | null> {
    const [row] = await this.drizzle.db
      .select({
        overallScore: startupEvaluation.overallScore,
        sectionScores: startupEvaluation.sectionScores,
        keyStrengths: startupEvaluation.keyStrengths,
        keyRisks: startupEvaluation.keyRisks,
        executiveSummary: startupEvaluation.executiveSummary,
        confidenceScore: startupEvaluation.confidenceScore,
        investorMemo: startupEvaluation.investorMemo,
        founderReport: startupEvaluation.founderReport,
        dataConfidenceNotes: startupEvaluation.dataConfidenceNotes,
      })
      .from(startupEvaluation)
      .where(eq(startupEvaluation.startupId, startupId))
      .limit(1);

    if (!row?.overallScore || !row.sectionScores) {
      return null;
    }

    const scores = row.sectionScores as SynthesisResult["sectionScores"];
    return {
      dealSnapshot: row.executiveSummary ?? "",
      keyStrengths: (row.keyStrengths as string[]) ?? [],
      keyRisks: (row.keyRisks as string[]) ?? [],
      exitScenarios: [],
      sectionScores: scores,
      overallScore: row.overallScore,
      confidenceScore: (row.confidenceScore as SynthesisResult["confidenceScore"]) ?? undefined,
      investorMemo: row.investorMemo as SynthesisResult["investorMemo"],
      founderReport: row.founderReport as SynthesisResult["founderReport"],
      dataConfidenceNotes: row.dataConfidenceNotes ?? "",
    };
  }

  private async loadStartup(startupId: string): Promise<{
    id: string;
    userId: string;
    submittedByRole: UserRole;
    status: StartupStatus;
    industry: string;
    sectorIndustryGroup: string | null;
    stage: string;
    fundingTarget: number;
    location: string;
    geoPath: string[] | null;
  }> {
    const [found] = await this.drizzle.db
      .select({
        id: startup.id,
        userId: startup.userId,
        submittedByRole: startup.submittedByRole,
        status: startup.status,
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

    if (!found) {
      throw new NotFoundException(`Startup ${startupId} not found`);
    }

    return {
      ...found,
      status: found.status as StartupStatus,
      submittedByRole: found.submittedByRole as UserRole,
      sectorIndustryGroup: found.sectorIndustryGroup ?? null,
      geoPath: found.geoPath ?? null,
    };
  }

  /**
   * Investor-private and scout-referral startups are siloed: thesis matching runs only for the
   * owning/target investor, not the full investor pool.
   */
  private async resolveRestrictToInvestorId(record: {
    id: string;
    userId: string;
    submittedByRole: UserRole;
  }): Promise<string | undefined> {
    if (record.submittedByRole === UserRole.INVESTOR) {
      return record.userId;
    }
    if (record.submittedByRole === UserRole.SCOUT) {
      const [row] = await this.drizzle.db
        .select({ investorId: scoutSubmission.investorId })
        .from(scoutSubmission)
        .where(eq(scoutSubmission.startupId, record.id))
        .limit(1);
      return row?.investorId;
    }
    return undefined;
  }

  /**
   * When the cross-investor pool is used, allow the requesting investor to be evaluated even if
   * they would be filtered out by coarse checks (e.g. inactive thesis). Must not pass startup
   * owners who are founders — that previously forced founders into the investor candidate list.
   */
  private async resolveForceIncludeInvestorId(
    requestedByUserId: string,
    restrictToInvestorId: string | undefined,
  ): Promise<string | undefined> {
    if (restrictToInvestorId) {
      return undefined;
    }
    const [row] = await this.drizzle.db
      .select({ role: user.role })
      .from(user)
      .where(eq(user.id, requestedByUserId))
      .limit(1);
    if (row?.role === UserRole.INVESTOR) {
      return requestedByUserId;
    }
    return undefined;
  }
}
