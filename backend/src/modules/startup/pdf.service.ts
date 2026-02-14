import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DrizzleService } from '../../database';
import { startup, StartupStatus } from './entities/startup.schema';
import { user } from '../../auth/entities/auth.schema';
import { startupEvaluation } from '../analysis/entities/analysis.schema';
import { generateMemoDocument } from './templates/memo.template';
import { generateReportDocument } from './templates/report.template';
import type { PdfStartupData } from './templates/pdf.types';

@Injectable()
export class PdfService {
  private readonly logger = new Logger(PdfService.name);

  constructor(private drizzle: DrizzleService) {}

  /**
   * Generate investment memo PDF for a startup
   */
  async generateMemo(startupId: string, userId: string): Promise<Buffer> {
    const data = await this.getStartupWithAccess(startupId, userId);

    const doc = generateMemoDocument({
      startup: data.startup,
      evaluation: data.evaluation,
      userEmail: data.userEmail,
      generatedAt: new Date(),
    });

    this.logger.log(`Generated memo PDF for startup ${startupId} by user ${userId}`);
    return this.pdfToBuffer(doc);
  }

  /**
   * Generate full analysis report PDF for a startup
   */
  async generateReport(startupId: string, userId: string): Promise<Buffer> {
    const data = await this.getStartupWithAccess(startupId, userId);

    const doc = generateReportDocument({
      startup: data.startup,
      evaluation: data.evaluation,
      userEmail: data.userEmail,
      generatedAt: new Date(),
    });

    this.logger.log(`Generated report PDF for startup ${startupId} by user ${userId}`);
    return this.pdfToBuffer(doc);
  }

  /**
   * Fetch startup + evaluation data and verify user access
   */
  private async getStartupWithAccess(
    startupId: string,
    userId: string,
  ): Promise<PdfStartupData> {
    const [requestingUser] = await this.drizzle.db
      .select({ id: user.id, email: user.email, name: user.name, role: user.role })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1);

    if (!requestingUser) {
      throw new NotFoundException('User not found');
    }

    const [foundStartup] = await this.drizzle.db
      .select()
      .from(startup)
      .where(eq(startup.id, startupId))
      .limit(1);

    if (!foundStartup) {
      throw new NotFoundException(`Startup with ID ${startupId} not found`);
    }

    const isOwner = foundStartup.userId === userId;
    const isAdmin = requestingUser.role === 'admin';
    const isApproved = foundStartup.status === StartupStatus.APPROVED;

    if (!isOwner && !isAdmin && !isApproved) {
      throw new ForbiddenException('You do not have access to this startup');
    }

    if (!isOwner && !isAdmin && foundStartup.status !== StartupStatus.APPROVED) {
      throw new ForbiddenException('Startup is not approved yet');
    }

    // Fetch evaluation from startupEvaluation table
    const [evaluation] = await this.drizzle.db
      .select()
      .from(startupEvaluation)
      .where(eq(startupEvaluation.startupId, startupId))
      .limit(1);

    return {
      startup: foundStartup,
      evaluation: evaluation ?? null,
      userEmail: requestingUser.email,
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
