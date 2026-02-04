import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job } from 'bullmq';
import { eq, isNotNull } from 'drizzle-orm';
import { BaseProcessor } from '../../../queue/processors/base.processor';
import {
  ANALYSIS_QUEUE_NAME,
  ANALYSIS_QUEUE_CONFIG,
  HIGH_SCORE_THRESHOLD,
} from '../analysis.config';
import { DrizzleService } from '../../../database';
import { AnalysisService } from '../analysis.service';
import { AnalysisJobStatus } from '../entities';
import { NotificationService } from '../../../notification/notification.service';
import { NotificationType } from '../../../notification/entities';
import { MatchService } from '../../investor/match.service';
import { ScoringService } from '../../investor/scoring.service';
import { investorThesis, InvestorThesis } from '../../investor/entities';
import type {
  MatchingJobData,
  MatchingJobResult,
  StartupScores,
} from '../interfaces';

@Injectable()
export class MatchingProcessor
  extends BaseProcessor<MatchingJobData, MatchingJobResult>
  implements OnModuleInit, OnModuleDestroy
{
  protected readonly logger = new Logger(MatchingProcessor.name);

  constructor(
    private config: ConfigService,
    private drizzle: DrizzleService,
    private analysisService: AnalysisService,
    private matchService: MatchService,
    private scoringService: ScoringService,
    private notificationService: NotificationService,
  ) {
    super(
      ANALYSIS_QUEUE_NAME,
      {
        host: config.get('REDIS_HOST'),
        port: config.get('REDIS_PORT'),
        password: config.get('REDIS_PASSWORD'),
        tls: config.get('REDIS_TLS') ? {} : undefined,
      },
      ANALYSIS_QUEUE_CONFIG.concurrency,
    );
  }

  onModuleInit() {
    this.initialize();
  }

  async onModuleDestroy() {
    await this.close();
  }

  protected async process(
    job: Job<MatchingJobData>,
  ): Promise<Omit<MatchingJobResult, 'jobId' | 'duration' | 'success'>> {
    const { startupId, analysisJobId } = job.data;

    if (job.data.type !== 'matching') {
      return { type: 'matching', matchCount: 0, highScoreMatches: 0 };
    }

    try {
      await this.analysisService.updateJobStatus(
        analysisJobId,
        AnalysisJobStatus.PROCESSING,
      );

      const scoringJob = await this.analysisService.getLatestScoringJob(startupId);
      if (!scoringJob?.result) {
        throw new Error(`No scoring results found for startup ${startupId}`);
      }

      const scores = (scoringJob.result as { scores: StartupScores }).scores;
      const activeInvestors = await this.getActiveInvestors();

      let matchCount = 0;
      let highScoreMatches = 0;
      const highScoreNotifications: Array<{
        investorId: string;
        overallScore: number;
      }> = [];

      for (const investor of activeInvestors) {
        const weights = await this.scoringService.findOne(investor.userId);
        const overallScore = this.matchService.calculateOverallScore(
          {
            marketScore: scores.marketScore,
            teamScore: scores.teamScore,
            productScore: scores.productScore,
            tractionScore: scores.tractionScore,
            financialsScore: scores.financialsScore,
          },
          weights,
        );

        await this.matchService.createOrUpdate(investor.userId, startupId, {
          marketScore: scores.marketScore,
          teamScore: scores.teamScore,
          productScore: scores.productScore,
          tractionScore: scores.tractionScore,
          financialsScore: scores.financialsScore,
          matchReason: this.generateMatchReason(scores, overallScore),
        });

        matchCount++;

        if (overallScore >= HIGH_SCORE_THRESHOLD) {
          highScoreMatches++;
          highScoreNotifications.push({
            investorId: investor.userId,
            overallScore,
          });
        }
      }

      if (highScoreNotifications.length > 0) {
        await this.sendHighScoreNotifications(startupId, highScoreNotifications);
      }

      await this.analysisService.updateJobStatus(
        analysisJobId,
        AnalysisJobStatus.COMPLETED,
        { matchCount, highScoreMatches },
      );

      this.logger.log(
        `Matching completed for startup ${startupId}: ${matchCount} matches, ${highScoreMatches} high-score`,
      );

      return { type: 'matching', matchCount, highScoreMatches };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      await this.analysisService.updateJobStatus(
        analysisJobId,
        AnalysisJobStatus.FAILED,
        undefined,
        errorMessage,
      );
      throw error;
    }
  }

  private async getActiveInvestors(): Promise<InvestorThesis[]> {
    return this.drizzle.db
      .select()
      .from(investorThesis)
      .where(eq(investorThesis.isActive, true));
  }

  private generateMatchReason(scores: StartupScores, overallScore: number): string {
    const strengths: string[] = [];

    if (scores.marketScore >= 80) strengths.push('strong market opportunity');
    if (scores.teamScore >= 80) strengths.push('experienced team');
    if (scores.productScore >= 80) strengths.push('innovative product');
    if (scores.tractionScore >= 80) strengths.push('solid traction');
    if (scores.financialsScore >= 80) strengths.push('healthy financials');

    if (strengths.length === 0) {
      return `Overall score: ${overallScore}%`;
    }

    return `Strong fit with ${strengths.join(', ')} (${overallScore}%)`;
  }

  private async sendHighScoreNotifications(
    startupId: string,
    notifications: Array<{ investorId: string; overallScore: number }>,
  ): Promise<void> {
    const notificationPayloads = notifications.map((n) => ({
      userId: n.investorId,
      title: 'New High-Score Match',
      message: `A new startup matches your investment thesis with a score of ${n.overallScore}%`,
      type: NotificationType.MATCH,
      link: `/investor/matches/${startupId}`,
    }));

    await this.notificationService.createBulk(notificationPayloads);
    this.logger.log(`Sent ${notifications.length} high-score notifications`);
  }
}
