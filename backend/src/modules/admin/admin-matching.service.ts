import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { desc, eq } from "drizzle-orm";
import { DrizzleService } from "../../database";
import { startup } from "../startup/entities/startup.schema";
import { StartupStatus } from "../startup/entities/startup.schema";
import { StartupMatchingPipelineService } from "../ai/services/startup-matching-pipeline.service";
import { analysisJob, AnalysisJobType } from "../analysis/entities/analysis.schema";
import { startupMatch, investorThesis } from "../investor/entities/investor.schema";
import { user } from "../../auth/entities/auth.schema";

@Injectable()
export class AdminMatchingService {
  constructor(
    private drizzle: DrizzleService,
    private startupMatching: StartupMatchingPipelineService,
  ) {}

  async triggerMatchForStartup(startupId: string, requestedBy: string) {
    const [found] = await this.drizzle.db
      .select()
      .from(startup)
      .where(eq(startup.id, startupId))
      .limit(1);

    if (!found) {
      throw new NotFoundException(`Startup ${startupId} not found`);
    }

    if (found.status !== StartupStatus.APPROVED) {
      throw new BadRequestException(
        `Startup must be approved before matching. Current status: ${found.status}`,
      );
    }

    return this.startupMatching.queueStartupMatching({
      startupId,
      requestedBy,
      triggerSource: "manual",
    });
  }

  async getLatestMatchingStatus(startupId: string) {
    const [found] = await this.drizzle.db
      .select({ id: startup.id })
      .from(startup)
      .where(eq(startup.id, startupId))
      .limit(1);

    if (!found) {
      throw new NotFoundException(`Startup ${startupId} not found`);
    }

    return this.startupMatching.getLatestMatchingStatus(startupId);
  }

  async getMatchingLogs(page = 1, limit = 20) {
    const offset = (page - 1) * limit;

    const jobs = await this.drizzle.db
      .select({
        id: analysisJob.id,
        startupId: analysisJob.startupId,
        startupName: startup.name,
        status: analysisJob.status,
        result: analysisJob.result,
        errorMessage: analysisJob.errorMessage,
        createdAt: analysisJob.createdAt,
        startedAt: analysisJob.startedAt,
        completedAt: analysisJob.completedAt,
      })
      .from(analysisJob)
      .innerJoin(startup, eq(analysisJob.startupId, startup.id))
      .where(eq(analysisJob.jobType, AnalysisJobType.MATCHING))
      .orderBy(desc(analysisJob.createdAt))
      .limit(limit)
      .offset(offset);

    return jobs.map((j) => {
      const result = j.result as Record<string, unknown> | null;
      return {
        id: j.id,
        startupId: j.startupId,
        startupName: j.startupName,
        status: j.status,
        triggerSource: (result?.triggerSource as string) ?? null,
        candidatesEvaluated: (result?.candidatesEvaluated as number) ?? null,
        matchesFound: (result?.matchesFound as number) ?? null,
        failedCandidates: (result?.failedCandidates as number) ?? null,
        errorMessage: j.errorMessage,
        createdAt: j.createdAt,
        startedAt: j.startedAt,
        completedAt: j.completedAt,
      };
    });
  }

  async getMatchingJobInvestors(jobId: string) {
    const [job] = await this.drizzle.db
      .select({
        id: analysisJob.id,
        startupId: analysisJob.startupId,
        status: analysisJob.status,
        createdAt: analysisJob.createdAt,
        startedAt: analysisJob.startedAt,
        completedAt: analysisJob.completedAt,
        result: analysisJob.result,
      })
      .from(analysisJob)
      .where(eq(analysisJob.id, jobId))
      .limit(1);

    if (!job) {
      throw new NotFoundException(`Matching job ${jobId} not found`);
    }

    if (job.status === "pending" || job.status === "processing") {
      return { job, investors: [] };
    }

    const matches = await this.drizzle.db
      .select({
        matchId: startupMatch.id,
        investorId: startupMatch.investorId,
        investorName: user.name,
        investorEmail: user.email,
        thesisFitScore: startupMatch.thesisFitScore,
        thesisFitFallback: startupMatch.thesisFitFallback,
        fitRationale: startupMatch.fitRationale,
        overallScore: startupMatch.overallScore,
        marketScore: startupMatch.marketScore,
        teamScore: startupMatch.teamScore,
        productScore: startupMatch.productScore,
        tractionScore: startupMatch.tractionScore,
        matchStatus: startupMatch.status,
        minThesisFitScore: investorThesis.minThesisFitScore,
        minStartupScore: investorThesis.minStartupScore,
        createdAt: startupMatch.createdAt,
      })
      .from(startupMatch)
      .innerJoin(user, eq(startupMatch.investorId, user.id))
      .leftJoin(investorThesis, eq(investorThesis.userId, startupMatch.investorId))
      .where(eq(startupMatch.startupId, job.startupId))
      .orderBy(desc(startupMatch.thesisFitScore));

    const result = job.result as Record<string, unknown> | null;

    return {
      job: {
        id: job.id,
        startupId: job.startupId,
        status: job.status,
        triggerSource: (result?.triggerSource as string) ?? null,
        candidatesEvaluated: (result?.candidatesEvaluated as number) ?? null,
        matchesFound: (result?.matchesFound as number) ?? null,
        failedCandidates: (result?.failedCandidates as number) ?? null,
        createdAt: job.createdAt,
        startedAt: job.startedAt,
        completedAt: job.completedAt,
      },
      investors: matches.map((m) => ({
        matchId: m.matchId,
        investorId: m.investorId,
        investorName: m.investorName,
        investorEmail: m.investorEmail,
        thesisFitScore: m.thesisFitScore,
        thesisFitFallback: m.thesisFitFallback,
        fitRationale: m.fitRationale,
        overallScore: m.overallScore,
        marketScore: m.marketScore,
        teamScore: m.teamScore,
        productScore: m.productScore,
        tractionScore: m.tractionScore,
        matchStatus: m.matchStatus,
        thresholdMet:
          m.minThesisFitScore !== null && m.thesisFitScore !== null
            ? m.thesisFitScore >= m.minThesisFitScore
            : null,
        thesisThreshold: m.minThesisFitScore,
        startupScoreThreshold: m.minStartupScore,
        createdAt: m.createdAt,
      })),
    };
  }
}
