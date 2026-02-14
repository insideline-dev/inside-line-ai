import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { eq, and, desc } from 'drizzle-orm';
import { DrizzleService } from '../../../database';
import { NotificationService } from '../../../notification/notification.service';
import { NotificationType } from '../../../notification/entities';
import { StartupIntakeService } from '../../startup/startup-intake.service';
import { AttachmentService } from './attachment.service';
import { investorInboxSubmission, type InvestorInboxSubmissionRecord } from './entities';

export interface EvaluateParams {
  userId: string;
  threadId: string;
  messageId: string;
  inboxId: string;
  subject: string;
  bodyText: string | null;
  fromEmail: string;
  attachments: Array<{ filename: string; contentType: string; storageKey: string }>;
}

@Injectable()
export class InvestorInboxBridgeService {
  private readonly logger = new Logger(InvestorInboxBridgeService.name);

  constructor(
    private drizzle: DrizzleService,
    private notifications: NotificationService,
    private startupIntake: StartupIntakeService,
    private attachmentService: AttachmentService,
  ) {}

  async evaluate(params: EvaluateParams): Promise<void> {
    const { userId, threadId, messageId, inboxId, subject, bodyText, fromEmail, attachments } = params;

    const hasPitchDeck = attachments.some(att =>
      this.attachmentService.isPitchDeck(att.filename, att.contentType),
    );
    const hasSignals = this.hasSubmissionSignals(subject, bodyText);

    if (!hasPitchDeck && !hasSignals) {
      return;
    }

    this.logger.log(`Potential startup submission detected in message ${messageId} from ${fromEmail}`);

    const suggestedName =
      this.startupIntake.extractCompanyFromBody(bodyText) ??
      this.startupIntake.extractCompanyFromFilename(
        attachments.find(att => this.attachmentService.isPitchDeck(att.filename, att.contentType))?.filename,
      ) ??
      null;

    const storageKeys = attachments.map(att => att.storageKey);

    await this.drizzle.db.insert(investorInboxSubmission).values({
      userId,
      threadId,
      messageId,
      inboxId,
      subject,
      bodyText: bodyText?.slice(0, 10000) ?? null,
      fromEmail,
      attachmentKeys: storageKeys,
      suggestedCompanyName: suggestedName,
      status: 'pending',
    });

    await this.notifications.create(
      userId,
      'Potential startup submission detected',
      `Email from ${fromEmail}${suggestedName ? ` (${suggestedName})` : ''} may contain a pitch deck. Review and confirm to start analysis.`,
      NotificationType.INFO,
      '/integrations/agentmail/inbox-submissions',
    );
  }

  async confirm(submissionId: string, userId: string): Promise<InvestorInboxSubmissionRecord> {
    const submission = await this.findSubmission(submissionId, userId);

    if (submission.status !== 'pending') {
      throw new Error(`Submission is already ${submission.status}`);
    }

    const companyName = submission.suggestedCompanyName ?? 'Untitled Startup';

    // Find pitch deck from stored attachment keys
    const pitchDeckPath = (submission.attachmentKeys as string[])?.[0] ?? undefined;

    const result = await this.startupIntake.createStartup({
      adminUserId: userId,
      companyName,
      fromEmail: submission.fromEmail,
      bodyText: submission.bodyText ?? undefined,
      pitchDeckPath,
      source: 'investor-inbox',
    });

    const [updated] = await this.drizzle.db
      .update(investorInboxSubmission)
      .set({
        status: 'confirmed',
        startupId: result.startupId,
        updatedAt: new Date(),
      })
      .where(eq(investorInboxSubmission.id, submissionId))
      .returning();

    this.logger.log(`Confirmed submission ${submissionId} → startup ${result.startupId}`);

    return updated;
  }

  async dismiss(submissionId: string, userId: string): Promise<InvestorInboxSubmissionRecord> {
    const submission = await this.findSubmission(submissionId, userId);

    if (submission.status !== 'pending') {
      throw new Error(`Submission is already ${submission.status}`);
    }

    const [updated] = await this.drizzle.db
      .update(investorInboxSubmission)
      .set({
        status: 'dismissed',
        updatedAt: new Date(),
      })
      .where(eq(investorInboxSubmission.id, submissionId))
      .returning();

    return updated;
  }

  async listPending(userId: string): Promise<InvestorInboxSubmissionRecord[]> {
    return this.drizzle.db
      .select()
      .from(investorInboxSubmission)
      .where(
        and(
          eq(investorInboxSubmission.userId, userId),
          eq(investorInboxSubmission.status, 'pending'),
        ),
      )
      .orderBy(desc(investorInboxSubmission.createdAt));
  }

  private async findSubmission(
    submissionId: string,
    userId: string,
  ): Promise<InvestorInboxSubmissionRecord> {
    const [submission] = await this.drizzle.db
      .select()
      .from(investorInboxSubmission)
      .where(
        and(
          eq(investorInboxSubmission.id, submissionId),
          eq(investorInboxSubmission.userId, userId),
        ),
      )
      .limit(1);

    if (!submission) throw new NotFoundException('Submission not found');
    return submission;
  }

  private hasSubmissionSignals(subject: string, body: string | null): boolean {
    const text = `${subject} ${body ?? ''}`.toLowerCase();
    const signals = [
      'pitch deck',
      'raising a round',
      'seed round',
      'series a',
      'series b',
      'investment opportunity',
      'deal flow',
      'take a look',
      'fundraising',
      'looking for investors',
      'investor deck',
      'startup pitch',
    ];
    return signals.some(signal => text.includes(signal));
  }
}
