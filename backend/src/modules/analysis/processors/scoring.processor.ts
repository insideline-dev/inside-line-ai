import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job } from 'bullmq';
import { eq } from 'drizzle-orm';
import { BaseProcessor } from '../../../queue/processors/base.processor';
import { ANALYSIS_QUEUE_NAME, ANALYSIS_QUEUE_CONFIG } from '../analysis.config';
import { DrizzleService } from '../../../database';
import { AnalysisService } from '../analysis.service';
import { AnalysisJobStatus } from '../entities';
import { startup, Startup } from '../../startup/entities';
import type { ScoringJobData, ScoringJobResult, StartupScores } from '../interfaces';

@Injectable()
export class ScoringProcessor
  extends BaseProcessor<ScoringJobData, ScoringJobResult>
  implements OnModuleInit, OnModuleDestroy
{
  protected readonly logger = new Logger(ScoringProcessor.name);

  constructor(
    private config: ConfigService,
    private drizzle: DrizzleService,
    private analysisService: AnalysisService,
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
    job: Job<ScoringJobData>,
  ): Promise<Omit<ScoringJobResult, 'jobId' | 'duration' | 'success'>> {
    const { startupId, analysisJobId } = job.data;

    if (job.data.type !== 'scoring') {
      return { type: 'scoring', scores: this.getEmptyScores() };
    }

    try {
      await this.analysisService.updateJobStatus(
        analysisJobId,
        AnalysisJobStatus.PROCESSING,
      );

      const startupData = await this.getStartup(startupId);
      if (!startupData) {
        throw new Error(`Startup ${startupId} not found`);
      }

      const scores = this.calculateScores(startupData);

      await this.analysisService.updateJobStatus(
        analysisJobId,
        AnalysisJobStatus.COMPLETED,
        { scores },
      );

      this.logger.log(`Scoring completed for startup ${startupId}`);

      return { type: 'scoring', scores };
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

  private async getStartup(startupId: string): Promise<Startup | null> {
    const [result] = await this.drizzle.db
      .select()
      .from(startup)
      .where(eq(startup.id, startupId))
      .limit(1);

    return result ?? null;
  }

  private calculateScores(startupData: Startup): StartupScores {
    return {
      marketScore: this.calculateMarketScore(startupData),
      teamScore: this.calculateTeamScore(startupData),
      productScore: this.calculateProductScore(startupData),
      tractionScore: this.calculateTractionScore(startupData),
      financialsScore: this.calculateFinancialsScore(startupData),
    };
  }

  private calculateMarketScore(startupData: Startup): number {
    let score = 50;

    const highValueIndustries = ['fintech', 'healthtech', 'ai', 'saas', 'enterprise'];
    if (highValueIndustries.some((i) => startupData.industry?.toLowerCase().includes(i))) {
      score += 20;
    }

    if (startupData.fundingTarget > 1000000) score += 10;
    if (startupData.fundingTarget > 5000000) score += 10;

    if (startupData.stage === 'seed') score += 10;
    if (startupData.stage === 'series-a') score += 15;

    return Math.min(Math.max(score, 0), 100);
  }

  private calculateTeamScore(startupData: Startup): number {
    let score = 50;

    if (startupData.teamSize >= 3) score += 10;
    if (startupData.teamSize >= 5) score += 10;
    if (startupData.teamSize >= 10) score += 10;

    if (startupData.website) score += 10;
    if (startupData.pitchDeckUrl) score += 10;

    return Math.min(Math.max(score, 0), 100);
  }

  private calculateProductScore(startupData: Startup): number {
    let score = 50;

    if (startupData.description && startupData.description.length > 200) score += 15;
    if (startupData.tagline && startupData.tagline.length > 10) score += 10;
    if (startupData.demoUrl) score += 15;
    if (startupData.pitchDeckUrl) score += 10;

    return Math.min(Math.max(score, 0), 100);
  }

  private calculateTractionScore(startupData: Startup): number {
    let score = 40;

    if (startupData.stage === 'seed') score += 15;
    if (startupData.stage === 'series-a') score += 25;
    if (startupData.stage === 'series-b+') score += 35;

    if (startupData.teamSize > 5) score += 10;

    return Math.min(Math.max(score, 0), 100);
  }

  private calculateFinancialsScore(startupData: Startup): number {
    let score = 50;

    if (startupData.fundingTarget > 0 && startupData.fundingTarget <= 500000) {
      score += 15;
    } else if (startupData.fundingTarget > 500000 && startupData.fundingTarget <= 2000000) {
      score += 20;
    } else if (startupData.fundingTarget > 2000000) {
      score += 10;
    }

    if (startupData.stage === 'seed' || startupData.stage === 'pre-seed') {
      score += 10;
    }

    return Math.min(Math.max(score, 0), 100);
  }

  private getEmptyScores(): StartupScores {
    return {
      marketScore: 0,
      teamScore: 0,
      productScore: 0,
      tractionScore: 0,
      financialsScore: 0,
    };
  }
}
