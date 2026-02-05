import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { eq, and, desc } from 'drizzle-orm';
import { DrizzleService } from '../../database';
import { startup, StartupStatus } from './entities/startup.schema';
import { user } from '../../auth/entities/auth.schema';
import { analysisJob, AnalysisJobStatus } from '../analysis/entities/analysis.schema';
import { generateMemoDocument, StartupWithAnalysis } from './templates/memo.template';
import { generateReportDocument } from './templates/report.template';

@Injectable()
export class PdfService {
  private readonly logger = new Logger(PdfService.name);

  constructor(private drizzle: DrizzleService) {}

  /**
   * Generate investment memo PDF for a startup
   * Access: owner, admin, or (future) investors with access
   */
  async generateMemo(startupId: string, userId: string): Promise<Buffer> {
    const { startupData, userData } = await this.getStartupWithAccess(startupId, userId);

    const doc = generateMemoDocument({
      startup: startupData,
      userEmail: userData.email,
      generatedAt: new Date(),
    });

    this.logger.log(`Generated memo PDF for startup ${startupId} by user ${userId}`);

    return this.pdfToBuffer(doc);
  }

  /**
   * Generate full analysis report PDF for a startup
   * Access: owner, admin, or (future) investors with access
   */
  async generateReport(startupId: string, userId: string): Promise<Buffer> {
    const { startupData, userData } = await this.getStartupWithAccess(startupId, userId);

    const doc = generateReportDocument({
      startup: startupData,
      userEmail: userData.email,
      generatedAt: new Date(),
    });

    this.logger.log(`Generated report PDF for startup ${startupId} by user ${userId}`);

    return this.pdfToBuffer(doc);
  }

  /**
   * Fetch startup with analysis data and verify user access
   * Returns startup with embedded analysis and requesting user info
   */
  private async getStartupWithAccess(
    startupId: string,
    userId: string,
  ): Promise<{ startupData: StartupWithAnalysis; userData: { email: string; name: string } }> {
    // Fetch requesting user
    const [requestingUser] = await this.drizzle.db
      .select({ id: user.id, email: user.email, name: user.name, role: user.role })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1);

    if (!requestingUser) {
      throw new NotFoundException('User not found');
    }

    // Fetch startup
    const [foundStartup] = await this.drizzle.db
      .select()
      .from(startup)
      .where(eq(startup.id, startupId))
      .limit(1);

    if (!foundStartup) {
      throw new NotFoundException(`Startup with ID ${startupId} not found`);
    }

    // Access control: owner, admin, or approved startup
    const isOwner = foundStartup.userId === userId;
    const isAdmin = requestingUser.role === 'admin';
    const isApproved = foundStartup.status === StartupStatus.APPROVED;

    if (!isOwner && !isAdmin && !isApproved) {
      throw new ForbiddenException('You do not have access to this startup');
    }

    // Non-admin, non-owner can only access approved startups
    if (!isOwner && !isAdmin && foundStartup.status !== StartupStatus.APPROVED) {
      throw new ForbiddenException('Startup is not approved yet');
    }

    // Fetch owner info for the startup
    const [startupOwner] = await this.drizzle.db
      .select({ email: user.email, name: user.name })
      .from(user)
      .where(eq(user.id, foundStartup.userId))
      .limit(1);

    // Fetch latest analysis data
    const analysis = await this.getLatestAnalysis(startupId);

    const startupData: StartupWithAnalysis = {
      ...foundStartup,
      analysis,
      user: startupOwner,
    };

    return {
      startupData,
      userData: { email: requestingUser.email, name: requestingUser.name },
    };
  }

  /**
   * Fetch the latest completed analysis for a startup
   */
  private async getLatestAnalysis(startupId: string): Promise<StartupWithAnalysis['analysis']> {
    const [job] = await this.drizzle.db
      .select()
      .from(analysisJob)
      .where(
        and(
          eq(analysisJob.startupId, startupId),
          eq(analysisJob.status, AnalysisJobStatus.COMPLETED),
        ),
      )
      .orderBy(desc(analysisJob.completedAt))
      .limit(1);

    if (!job?.result) {
      return undefined;
    }

    const result = job.result as Record<string, unknown>;

    return {
      overallScore: result.overallScore as number | undefined,
      teamScore: result.teamScore as number | undefined,
      marketScore: result.marketScore as number | undefined,
      productScore: result.productScore as number | undefined,
      tractionScore: result.tractionScore as number | undefined,
      financialScore: result.financialScore as number | undefined,
      highlights: result.highlights as string[] | undefined,
      teamAnalysis: result.teamAnalysis as string | undefined,
      marketAnalysis: result.marketAnalysis as string | undefined,
      productAnalysis: result.productAnalysis as string | undefined,
      tractionAnalysis: result.tractionAnalysis as string | undefined,
      financialAnalysis: result.financialAnalysis as string | undefined,
      founders: result.founders as Array<{ name: string; title: string }> | undefined,
      marketSize: result.marketSize as string | undefined,
      targetMarket: result.targetMarket as string | undefined,
      productDescription: result.productDescription as string | undefined,
      keyMetrics: result.keyMetrics as string[] | undefined,
      amountRaised: result.amountRaised as number | undefined,
    };
  }

  /**
   * Convert PDFKit document to Buffer
   */
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
