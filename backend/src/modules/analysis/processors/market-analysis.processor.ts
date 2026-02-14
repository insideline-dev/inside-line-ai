import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job } from 'bullmq';
import { eq } from 'drizzle-orm';
import { BaseProcessor, parseRedisUrl } from '../../../queue/processors/base.processor';
import { ANALYSIS_QUEUE_NAME, ANALYSIS_QUEUE_CONFIG } from '../analysis.config';
import { DrizzleService } from '../../../database';
import { AnalysisService } from '../analysis.service';
import { AnalysisJobStatus } from '../entities';
import { NotificationGateway } from '../../../notification/notification.gateway';
import { startup, Startup } from '../../startup/entities';
import type {
  MarketAnalysisJobData,
  MarketAnalysisJobResult,
  MarketAnalysis,
} from '../interfaces';

@Injectable()
export class MarketAnalysisProcessor
  extends BaseProcessor<MarketAnalysisJobData, MarketAnalysisJobResult>
  implements OnModuleInit, OnModuleDestroy
{
  protected readonly logger = new Logger(MarketAnalysisProcessor.name);

  constructor(
    private config: ConfigService,
    private drizzle: DrizzleService,
    private analysisService: AnalysisService,
    private notificationGateway: NotificationGateway,
  ) {
    const redisUrl = config.get<string>('REDIS_URL', 'redis://localhost:6379');
    const queuePrefix = config.get<string>('QUEUE_PREFIX');
    super(
      ANALYSIS_QUEUE_NAME,
      parseRedisUrl(redisUrl),
      ANALYSIS_QUEUE_CONFIG.concurrency,
      queuePrefix,
    );
  }

  onModuleInit() {
    this.initialize();
  }

  async onModuleDestroy() {
    await this.close();
  }

  protected async process(
    job: Job<MarketAnalysisJobData>,
  ): Promise<Omit<MarketAnalysisJobResult, 'jobId' | 'duration' | 'success'>> {
    const { startupId, analysisJobId, userId } = job.data;

    if (job.data.type !== 'market_analysis') {
      return { type: 'market_analysis', analysis: this.getEmptyAnalysis() };
    }

    try {
      await this.analysisService.updateJobStatus(
        analysisJobId,
        AnalysisJobStatus.PROCESSING,
      );

      this.notificationGateway.sendJobStatus(userId, {
        jobId: analysisJobId,
        jobType: 'market_analysis',
        status: 'processing',
      });

      const startupData = await this.getStartup(startupId);
      if (!startupData) {
        throw new Error(`Startup ${startupId} not found`);
      }

      // Stub implementation - returns mock market analysis
      // In production, this would integrate with market research APIs or AI
      const analysis = this.generateMockAnalysis(startupData);

      await this.analysisService.updateJobStatus(
        analysisJobId,
        AnalysisJobStatus.COMPLETED,
        { analysis },
      );

      this.notificationGateway.sendJobStatus(userId, {
        jobId: analysisJobId,
        jobType: 'market_analysis',
        status: 'completed',
        result: { analysis },
      });

      this.logger.log(`Market analysis completed for startup ${startupId}`);

      return { type: 'market_analysis', analysis };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      await this.analysisService.updateJobStatus(
        analysisJobId,
        AnalysisJobStatus.FAILED,
        undefined,
        errorMessage,
      );

      this.notificationGateway.sendJobStatus(userId, {
        jobId: analysisJobId,
        jobType: 'market_analysis',
        status: 'failed',
        error: errorMessage,
      });

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

  private generateMockAnalysis(startupData: Startup): MarketAnalysis {
    // Stub: Generate mock market analysis based on startup data
    // In production, this would use real market research data

    const industryMultipliers: Record<string, number> = {
      fintech: 15,
      healthtech: 12,
      ai: 20,
      saas: 10,
      ecommerce: 8,
      edtech: 6,
    };

    const multiplier =
      Object.entries(industryMultipliers).find(([key]) =>
        startupData.industry?.toLowerCase().includes(key),
      )?.[1] ?? 5;

    const baseTam = 1000000000; // $1B base
    const tam = baseTam * multiplier;
    const sam = tam * 0.15;
    const som = sam * 0.05;

    return {
      marketSize: {
        tam,
        sam,
        som,
        currency: 'USD',
      },
      competitors: this.getMockCompetitors(startupData.industry),
      trends: this.getMockTrends(startupData.industry),
      risks: [
        'Market competition intensifying',
        'Regulatory changes possible',
        'Economic downturn impact',
        'Talent acquisition challenges',
      ],
      opportunities: [
        'Growing market demand',
        'Underserved customer segments',
        'Partnership opportunities',
        'Geographic expansion potential',
      ],
    };
  }

  private getMockCompetitors(industry: string | null): MarketAnalysis['competitors'] {
    const industryCompetitors: Record<string, MarketAnalysis['competitors']> = {
      fintech: [
        { name: 'Stripe', description: 'Payment infrastructure', fundingRaised: 8000000000 },
        { name: 'Plaid', description: 'Financial data platform', fundingRaised: 734000000 },
        { name: 'Brex', description: 'Corporate credit card', fundingRaised: 1200000000 },
      ],
      healthtech: [
        { name: 'Teladoc', description: 'Telehealth platform', fundingRaised: 500000000 },
        { name: 'Oscar Health', description: 'Health insurance', fundingRaised: 1600000000 },
      ],
      ai: [
        { name: 'OpenAI', description: 'AI research lab', fundingRaised: 11000000000 },
        { name: 'Anthropic', description: 'AI safety company', fundingRaised: 7000000000 },
      ],
    };

    const matchedIndustry = Object.keys(industryCompetitors).find((key) =>
      industry?.toLowerCase().includes(key),
    );

    return matchedIndustry
      ? industryCompetitors[matchedIndustry]
      : [
          { name: 'Competitor A', description: 'Market leader' },
          { name: 'Competitor B', description: 'Fast-growing challenger' },
        ];
  }

  private getMockTrends(industry: string | null): string[] {
    const baseTrends = [
      'Digital transformation acceleration',
      'Remote work driving adoption',
      'Increasing investor interest',
    ];

    if (industry?.toLowerCase().includes('fintech')) {
      return [...baseTrends, 'Open banking adoption', 'Embedded finance growth'];
    }
    if (industry?.toLowerCase().includes('ai')) {
      return [...baseTrends, 'Generative AI boom', 'Enterprise AI adoption'];
    }
    if (industry?.toLowerCase().includes('health')) {
      return [...baseTrends, 'Telehealth normalization', 'Digital health records'];
    }

    return baseTrends;
  }

  private getEmptyAnalysis(): MarketAnalysis {
    return {
      marketSize: { tam: 0, sam: 0, som: 0, currency: 'USD' },
      competitors: [],
      trends: [],
      risks: [],
      opportunities: [],
    };
  }
}
