import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job } from 'bullmq';
import { eq } from 'drizzle-orm';
import { BaseProcessor, parseRedisUrl } from '../../../queue/processors/base.processor';
import { ANALYSIS_QUEUE_NAME, ANALYSIS_QUEUE_CONFIG } from '../analysis.config';
import { DrizzleService } from '../../../database';
import { AnalysisService } from '../analysis.service';
import { AnalysisJobStatus, startupEvaluation } from '../entities';
import { NotificationService } from '../../../notification/notification.service';
import { NotificationGateway } from '../../../notification/notification.gateway';
import { NotificationType } from '../../../notification/entities';
import { StorageService } from '../../../storage/storage.service';
import { user } from '../../../auth/entities/auth.schema';
import { startup, Startup } from '../../startup/entities';
import { generateMemoDocument } from '../../startup/templates/memo.template';
import type { PdfJobData, PdfJobResult } from '../interfaces';
import type { PdfContext } from '../../startup/templates/pdf.types';

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
    private notificationGateway: NotificationGateway,
    private storageService: StorageService,
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
    job: Job<PdfJobData>,
  ): Promise<Omit<PdfJobResult, 'jobId' | 'duration' | 'success'>> {
    const { startupId, analysisJobId, requestedBy, userId } = job.data;

    if (job.data.type !== 'pdf') {
      return { type: 'pdf', pdfUrl: '', pdfKey: '' };
    }

    try {
      await this.analysisService.updateJobStatus(
        analysisJobId,
        AnalysisJobStatus.PROCESSING,
      );

      this.notificationGateway.sendJobStatus(userId, {
        jobId: analysisJobId,
        jobType: 'pdf',
        status: 'processing',
      });

      const startupData = await this.getStartup(startupId);
      if (!startupData) {
        throw new Error(`Startup ${startupId} not found`);
      }

      // Fetch the full evaluation from startupEvaluation table
      const [evaluation] = await this.drizzle.db
        .select()
        .from(startupEvaluation)
        .where(eq(startupEvaluation.startupId, startupId))
        .limit(1);

      const { pdfUrl, pdfKey } = await this.generateAndUploadPdf(
        startupData,
        evaluation ?? null,
        requestedBy,
      );

      await this.analysisService.updateJobStatus(
        analysisJobId,
        AnalysisJobStatus.COMPLETED,
        { pdfUrl, pdfKey },
      );

      this.notificationGateway.sendJobStatus(userId, {
        jobId: analysisJobId,
        jobType: 'pdf',
        status: 'completed',
        result: { pdfUrl, pdfKey },
      });

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

      this.notificationGateway.sendJobStatus(userId, {
        jobId: analysisJobId,
        jobType: 'pdf',
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

  private async generateAndUploadPdf(
    startupData: Startup,
    evaluation: typeof startupEvaluation.$inferSelect | null,
    userId: string,
  ): Promise<{ pdfUrl: string; pdfKey: string }> {
    const userEmail = await this.getUserEmail(userId);

    const ctx: PdfContext = {
      startup: startupData,
      evaluation,
      userEmail,
      generatedAt: new Date(),
    };

    const doc = generateMemoDocument(ctx);
    const pdfBuffer = await this.pdfToBuffer(doc);

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

  private async getUserEmail(userId: string): Promise<string> {
    const [result] = await this.drizzle.db
      .select({ email: user.email })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1);

    return result?.email ?? 'unknown@inside-line';
  }

  private pdfToBuffer(doc: PDFKit.PDFDocument): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];

      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      doc.end();
    });
  }
}
