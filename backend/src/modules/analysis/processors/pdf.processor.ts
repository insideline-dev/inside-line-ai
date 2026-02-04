import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job } from 'bullmq';
import { eq } from 'drizzle-orm';
import { BaseProcessor } from '../../../queue/processors/base.processor';
import { ANALYSIS_QUEUE_NAME, ANALYSIS_QUEUE_CONFIG } from '../analysis.config';
import { DrizzleService } from '../../../database';
import { AnalysisService } from '../analysis.service';
import { AnalysisJobStatus } from '../entities';
import { NotificationService } from '../../../notification/notification.service';
import { NotificationType } from '../../../notification/entities';
import { StorageService } from '../../../storage/storage.service';
import { startup, Startup } from '../../startup/entities';
import type { PdfJobData, PdfJobResult, StartupScores } from '../interfaces';

@Injectable()
export class PdfProcessor
  extends BaseProcessor<PdfJobData, PdfJobResult>
  implements OnModuleInit, OnModuleDestroy
{
  protected readonly logger = new Logger(PdfProcessor.name);

  constructor(
    private config: ConfigService,
    private drizzle: DrizzleService,
    private analysisService: AnalysisService,
    private notificationService: NotificationService,
    private storageService: StorageService,
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
    job: Job<PdfJobData>,
  ): Promise<Omit<PdfJobResult, 'jobId' | 'duration' | 'success'>> {
    const { startupId, analysisJobId, requestedBy } = job.data;

    if (job.data.type !== 'pdf') {
      return { type: 'pdf', pdfUrl: '', pdfKey: '' };
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

      const scoringJob = await this.analysisService.getLatestScoringJob(startupId);
      const scores = scoringJob?.result
        ? (scoringJob.result as { scores: StartupScores }).scores
        : null;

      const { pdfUrl, pdfKey } = await this.generateAndUploadPdf(
        startupData,
        scores,
        requestedBy,
      );

      await this.analysisService.updateJobStatus(
        analysisJobId,
        AnalysisJobStatus.COMPLETED,
        { pdfUrl, pdfKey },
      );

      await this.notificationService.create(
        requestedBy,
        'Investment Memo Ready',
        `The investment memo for ${startupData.name} is ready for download.`,
        NotificationType.SUCCESS,
        pdfUrl,
      );

      this.logger.log(`PDF generated for startup ${startupId}`);

      return { type: 'pdf', pdfUrl, pdfKey };
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

  private async generateAndUploadPdf(
    startupData: Startup,
    scores: StartupScores | null,
    userId: string,
  ): Promise<{ pdfUrl: string; pdfKey: string }> {
    // Stub implementation - generates mock PDF content
    // In production, this would use a PDF library like PDFKit or Puppeteer
    const memoContent = this.generateMemoContent(startupData, scores);
    const pdfBuffer = Buffer.from(memoContent, 'utf-8');

    const result = await this.storageService.uploadGeneratedContent(
      userId,
      'documents',
      pdfBuffer,
      'application/pdf',
      startupData.id,
      {
        startupId: startupData.id,
        startupName: startupData.name,
        generatedAt: new Date().toISOString(),
      },
    );

    return {
      pdfUrl: result.url,
      pdfKey: result.key,
    };
  }

  private generateMemoContent(
    startupData: Startup,
    scores: StartupScores | null,
  ): string {
    // Stub: In production, this would generate actual PDF content
    const lines = [
      `INVESTMENT MEMO - ${startupData.name}`,
      `Generated: ${new Date().toISOString()}`,
      '',
      `== COMPANY OVERVIEW ==`,
      `Name: ${startupData.name}`,
      `Tagline: ${startupData.tagline}`,
      `Industry: ${startupData.industry}`,
      `Stage: ${startupData.stage}`,
      `Location: ${startupData.location}`,
      `Team Size: ${startupData.teamSize}`,
      `Funding Target: $${startupData.fundingTarget.toLocaleString()}`,
      '',
      `== DESCRIPTION ==`,
      startupData.description,
      '',
    ];

    if (scores) {
      lines.push(
        `== SCORING ANALYSIS ==`,
        `Market Score: ${scores.marketScore}/100`,
        `Team Score: ${scores.teamScore}/100`,
        `Product Score: ${scores.productScore}/100`,
        `Traction Score: ${scores.tractionScore}/100`,
        `Financials Score: ${scores.financialsScore}/100`,
        '',
      );
    }

    if (startupData.website) {
      lines.push(`Website: ${startupData.website}`);
    }
    if (startupData.pitchDeckUrl) {
      lines.push(`Pitch Deck: ${startupData.pitchDeckUrl}`);
    }
    if (startupData.demoUrl) {
      lines.push(`Demo: ${startupData.demoUrl}`);
    }

    return lines.join('\n');
  }
}
