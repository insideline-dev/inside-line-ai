import { Injectable, Logger, NotFoundException, Optional, Inject, forwardRef } from '@nestjs/common';
import { eq, and, desc, gt, count as drizzleCount, or } from 'drizzle-orm';
import { DrizzleService } from '../../../database';
import {
  integrationWebhook,
  emailThread,
  WebhookSource,
  type EmailThread,
  type NewEmailThread,
} from '../../integration/entities';
import { agentmailConfig, type AgentMailConfigRecord } from './entities';
import { NotificationService } from '../../../notification/notification.service';
import { NotificationType } from '../../../notification/entities';
import { AttachmentService } from './attachment.service';
import { AgentMailClientService } from './agentmail-client.service';
import { ClaraService } from '../../clara/clara.service';
import { InvestorInboxBridgeService } from './investor-inbox-bridge.service';
import type {
  AgentMailWebhook,
  GetThreadsQuery,
  AgentMailConfig,
  SendEmail,
  ReplyEmail,
  CreateInbox,
} from './dto';

export type PaginatedThreads = {
  data: EmailThread[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

type WebhookAttachment = {
  filename: string;
  contentType: string;
  attachmentId: string | null;
};

type WebhookMessageSnapshot = {
  from: string;
  to: string[];
  subject: string;
  text: string | null;
  timestamp: Date;
  attachments: WebhookAttachment[];
};

@Injectable()
export class AgentMailService {
  private readonly logger = new Logger(AgentMailService.name);

  constructor(
    private drizzle: DrizzleService,
    private notificationService: NotificationService,
    private attachmentService: AttachmentService,
    private agentMailClient: AgentMailClientService,
    @Optional() @Inject(forwardRef(() => ClaraService)) private claraService: ClaraService | null,
    private investorInboxBridge: InvestorInboxBridgeService,
  ) {}

  // ============================================================================
  // WEBHOOK HANDLING (ID-only payload -> fetch full message via SDK)
  // ============================================================================

  async handleWebhook(payload: AgentMailWebhook): Promise<void> {
    const webhookPayload: Record<string, unknown> = payload as unknown as Record<string, unknown>;
    const eventType = this.asNonEmptyString(webhookPayload.event_type) ?? 'message.received';
    let webhookRowId: string | null = null;

    try {
      const [inserted] = await this.drizzle.db
        .insert(integrationWebhook)
        .values({
          source: WebhookSource.AGENTMAIL,
          eventType,
          payload: webhookPayload,
          processed: false,
        })
        .returning({ id: integrationWebhook.id });
      webhookRowId = inserted?.id ?? null;

      await this.processWebhookEvent(payload);

      const refs = this.extractWebhookReferences(payload);

      if (webhookRowId) {
        await this.drizzle.db
          .update(integrationWebhook)
          .set({ processed: true })
          .where(eq(integrationWebhook.id, webhookRowId));
      }

      this.logger.log(
        `Processed webhook: message ${refs.messageId ?? '(unknown)'} in thread ${refs.threadId ?? '(unknown)'}`,
      );
    } catch (error) {
      this.logger.error(`Webhook processing failed: ${error.message}`, error);

      if (webhookRowId) {
        await this.drizzle.db
          .update(integrationWebhook)
          .set({ processed: false, errorMessage: error.message })
          .where(eq(integrationWebhook.id, webhookRowId));
      }

      throw error;
    }
  }

  private async processWebhookEvent(payload: AgentMailWebhook): Promise<void> {
    const refs = this.extractWebhookReferences(payload);
    const { inboxId, threadId, messageId, messageSnapshot } = refs;

    if (!inboxId) {
      this.logger.warn('Skipping webhook: missing inbox_id in payload');
      return;
    }

    if (!threadId) {
      this.logger.warn(`Skipping webhook: missing thread_id for inbox ${inboxId}`);
      return;
    }

    // Route to Clara if this is Clara's inbox
    if (this.claraService?.isClaraInbox(inboxId)) {
      this.logger.log(`Routing message ${messageId ?? '(unknown)'} to Clara`);
      await this.claraService.handleIncomingMessage(inboxId, threadId, messageId ?? '');
      return;
    }

    const userId = await this.findUserByInbox(inboxId);
    if (!userId) {
      this.logger.warn(`No user found for inbox ${inboxId}, skipping`);
      return;
    }

    const message = messageSnapshot ?? await this.fetchMessageFromSdk(inboxId, messageId);

    // Find existing thread or create new one
    const [existingThread] = await this.drizzle.db
      .select()
      .from(emailThread)
      .where(eq(emailThread.threadId, threadId))
      .limit(1);

    if (existingThread) {
      await this.drizzle.db
        .update(emailThread)
        .set({
          lastMessageAt: message.timestamp,
          unreadCount: existingThread.unreadCount + 1,
        })
        .where(eq(emailThread.id, existingThread.id));
    } else {
      const participants = [message.from, ...message.to];
      const newThread: NewEmailThread = {
        userId,
        threadId,
        subject: message.subject ?? '(no subject)',
        participants,
        lastMessageAt: message.timestamp,
        unreadCount: 1,
      };
      await this.drizzle.db.insert(emailThread).values(newThread);
    }

    // Download attachments asynchronously
    const attachmentKeyById = new Map<string, string>();
    if (message.attachments && message.attachments.length > 0) {
      const sdkAttachments = message.attachments.filter(
        (att) => Boolean(att.attachmentId),
      );

      if (sdkAttachments.length > 0 && messageId) {
        const attachmentDownloads = sdkAttachments.map((att) => ({
          filename: att.filename,
          content_type: att.contentType,
          attachmentId: att.attachmentId!,
          inboxId,
          messageId,
        }));
        const attachmentKeys = await this.attachmentService.downloadFromSdk(
          userId,
          inboxId,
          messageId,
          attachmentDownloads,
          this.agentMailClient,
        );

        attachmentDownloads.forEach((att, index) => {
          const key = attachmentKeys[index];
          if (key) {
            attachmentKeyById.set(att.attachmentId, key);
          }
        });
      }
    }

    // Evaluate for potential startup submission
    const attachmentMetas = message.attachments?.map((att) => ({
      filename: att.filename,
      contentType: att.contentType,
      storageKey: att.attachmentId ? (attachmentKeyById.get(att.attachmentId) ?? '') : '',
    })) ?? [];

    await this.investorInboxBridge.evaluate({
      userId,
      threadId,
      messageId: messageId ?? threadId,
      inboxId,
      subject: message.subject ?? '',
      bodyText: typeof message.text === 'string' ? message.text : null,
      fromEmail: message.from,
      attachments: attachmentMetas,
    });

    // Create notification
    const subject = message.subject ?? '(no subject)';
    const isPriority = this.isPriorityEmail(subject);

    await this.notificationService.create(
      userId,
      `New email from ${message.from}`,
      subject,
      isPriority ? NotificationType.WARNING : NotificationType.INFO,
      `/integrations/agentmail/threads/${threadId}`,
    );
  }

  private async fetchMessageFromSdk(
    inboxId: string,
    messageId: string | null,
  ): Promise<WebhookMessageSnapshot> {
    if (!messageId) {
      throw new Error('SDK getMessage failed: missing message_id in webhook payload');
    }

    try {
      const message = await this.agentMailClient.getMessage(inboxId, messageId);
      return {
        from: message.from,
        to: Array.isArray(message.to) ? message.to : [],
        subject: message.subject ?? '(no subject)',
        text: typeof message.text === 'string' ? message.text : null,
        timestamp: this.parseDateOrNow(message.timestamp),
        attachments: (message.attachments ?? []).map((att) => ({
          filename: att.filename ?? 'attachment',
          contentType: att.contentType ?? 'application/octet-stream',
          attachmentId: att.attachmentId ?? null,
        })),
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to fetch message ${messageId} from SDK: ${errorMessage}`, error);
      throw new Error(`SDK getMessage failed: ${errorMessage}`);
    }
  }

  private extractWebhookReferences(payload: AgentMailWebhook): {
    inboxId: string | null;
    threadId: string | null;
    messageId: string | null;
    messageSnapshot: WebhookMessageSnapshot | null;
  } {
    const raw = payload as unknown as Record<string, unknown>;
    const message = this.getObject(raw.message);
    const thread = this.getObject(raw.thread);

    const inboxId =
      this.asNonEmptyString(raw.inbox_id)
      ?? this.asNonEmptyString(message?.inbox_id)
      ?? this.asNonEmptyString(thread?.inbox_id);
    const threadId =
      this.asNonEmptyString(raw.thread_id)
      ?? this.asNonEmptyString(message?.thread_id)
      ?? this.asNonEmptyString(thread?.thread_id)
      ?? this.asNonEmptyString(thread?.id);
    const messageId =
      this.asNonEmptyString(raw.message_id)
      ?? this.asNonEmptyString(message?.id)
      ?? this.asNonEmptyString(message?.message_id)
      ?? this.asNonEmptyString(message?.smtp_id);

    return {
      inboxId,
      threadId,
      messageId,
      messageSnapshot: message ? this.createMessageSnapshot(message) : null,
    };
  }

  private createMessageSnapshot(message: Record<string, unknown>): WebhookMessageSnapshot {
    const toRaw = message.to;
    const to = Array.isArray(toRaw)
      ? toRaw
        .map((entry) => this.asNonEmptyString(entry))
        .filter((entry): entry is string => Boolean(entry))
      : [];

    return {
      from: this.asNonEmptyString(message.from) ?? '(unknown sender)',
      to,
      subject: this.asNonEmptyString(message.subject) ?? '(no subject)',
      text:
        this.asNonEmptyString(message.text)
        ?? this.asNonEmptyString(message.extracted_text),
      timestamp: this.parseDateOrNow(message.timestamp ?? message.created_at),
      attachments: this.extractWebhookAttachments(message.attachments),
    };
  }

  private extractWebhookAttachments(rawAttachments: unknown): WebhookAttachment[] {
    if (!Array.isArray(rawAttachments)) {
      return [];
    }

    return rawAttachments
      .map((attachment) => {
        const parsed = this.getObject(attachment);
        if (!parsed) {
          return null;
        }

        return {
          filename:
            this.asNonEmptyString(parsed.filename)
            ?? this.asNonEmptyString(parsed.name)
            ?? this.asNonEmptyString(parsed.original_filename)
            ?? 'attachment',
          contentType:
            this.asNonEmptyString(parsed.content_type)
            ?? this.asNonEmptyString(parsed.contentType)
            ?? this.asNonEmptyString(parsed.mime_type)
            ?? 'application/octet-stream',
          attachmentId:
            this.asNonEmptyString(parsed.attachment_id)
            ?? this.asNonEmptyString(parsed.attachmentId)
            ?? this.asNonEmptyString(parsed.id),
        };
      })
      .filter((attachment): attachment is WebhookAttachment => Boolean(attachment));
  }

  private parseDateOrNow(value: unknown): Date {
    const parsed = this.asNonEmptyString(value);
    if (!parsed) {
      return new Date();
    }

    const date = new Date(parsed);
    if (Number.isNaN(date.getTime())) {
      return new Date();
    }

    return date;
  }

  private asNonEmptyString(value: unknown): string | null {
    if (typeof value !== 'string') {
      return null;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  private getObject(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }

    return value as Record<string, unknown>;
  }

  private async findUserByInbox(inboxId: string): Promise<string | null> {
    const [config] = await this.drizzle.db
      .select()
      .from(agentmailConfig)
      .where(
        or(
          eq(agentmailConfig.inboxId, inboxId),
          eq(agentmailConfig.inboxEmail, inboxId),
        ),
      )
      .limit(1);

    return config?.userId ?? null;
  }

  private isPriorityEmail(subject: string): boolean {
    const priorityKeywords = ['urgent', 'follow-up', 'important', 'asap'];
    return priorityKeywords.some((keyword) =>
      subject.toLowerCase().includes(keyword),
    );
  }

  // ============================================================================
  // INBOX MANAGEMENT
  // ============================================================================

  async createInboxForUser(
    userId: string,
    params: CreateInbox,
  ): Promise<AgentMailConfigRecord> {
    const inbox = await this.agentMailClient.createInbox({
      username: params.username,
      displayName: params.displayName,
    });

    const [config] = await this.drizzle.db
      .insert(agentmailConfig)
      .values({
        userId,
        inboxId: inbox.inboxId,
        inboxEmail: `${params.username ?? inbox.inboxId}@agentmail.to`,
        displayName: params.displayName,
        isActive: true,
      })
      .onConflictDoUpdate({
        target: agentmailConfig.userId,
        set: {
          inboxId: inbox.inboxId,
          inboxEmail: `${params.username ?? inbox.inboxId}@agentmail.to`,
          displayName: params.displayName,
          isActive: true,
          updatedAt: new Date(),
        },
      })
      .returning();

    return config;
  }

  async listInboxes(limit?: number, pageToken?: string) {
    return this.agentMailClient.listInboxes(limit, pageToken);
  }

  async getInbox(inboxId: string) {
    return this.agentMailClient.getInbox(inboxId);
  }

  // ============================================================================
  // EMAIL SEND / REPLY
  // ============================================================================

  async sendUserEmail(userId: string, params: SendEmail) {
    const config = await this.getUserConfig(userId);
    return this.agentMailClient.sendMessage(config.inboxId, params);
  }

  async replyToUserEmail(userId: string, messageId: string, params: ReplyEmail) {
    const config = await this.getUserConfig(userId);
    return this.agentMailClient.replyToMessage(config.inboxId, messageId, params);
  }

  // ============================================================================
  // MESSAGE / THREAD RETRIEVAL (SDK)
  // ============================================================================

  async listUserMessages(
    userId: string,
    options?: { limit?: number; pageToken?: string; before?: string; after?: string },
  ) {
    const config = await this.getUserConfig(userId);
    return this.agentMailClient.listMessages(config.inboxId, {
      limit: options?.limit,
      pageToken: options?.pageToken,
      before: options?.before ? new Date(options.before) : undefined,
      after: options?.after ? new Date(options.after) : undefined,
    });
  }

  async getUserMessage(userId: string, messageId: string) {
    const config = await this.getUserConfig(userId);
    return this.agentMailClient.getMessage(config.inboxId, messageId);
  }

  async listUserSdkThreads(
    userId: string,
    options?: { limit?: number; pageToken?: string; before?: string; after?: string },
  ) {
    const config = await this.getUserConfig(userId);
    return this.agentMailClient.listThreads(config.inboxId, {
      limit: options?.limit,
      pageToken: options?.pageToken,
      before: options?.before ? new Date(options.before) : undefined,
      after: options?.after ? new Date(options.after) : undefined,
    });
  }

  async downloadUserAttachment(userId: string, messageId: string, attachmentId: string) {
    const config = await this.getUserConfig(userId);
    return this.agentMailClient.getMessageAttachment(config.inboxId, messageId, attachmentId);
  }

  // ============================================================================
  // LOCAL THREAD MANAGEMENT (DB)
  // ============================================================================

  async findThreads(userId: string, query: GetThreadsQuery): Promise<PaginatedThreads> {
    const { page, limit, unread } = query;
    const offset = (page - 1) * limit;

    const conditions = [eq(emailThread.userId, userId)];
    if (unread !== undefined) {
      if (unread) {
        conditions.push(gt(emailThread.unreadCount, 0));
      } else {
        conditions.push(eq(emailThread.unreadCount, 0));
      }
    }

    const [{ count: total }] = await this.drizzle.db
      .select({ count: drizzleCount() })
      .from(emailThread)
      .where(and(...conditions));

    const data = await this.drizzle.db
      .select()
      .from(emailThread)
      .where(and(...conditions))
      .orderBy(desc(emailThread.lastMessageAt))
      .limit(limit)
      .offset(offset);

    return {
      data,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async findThread(id: string, userId: string): Promise<EmailThread> {
    const [thread] = await this.drizzle.db
      .select()
      .from(emailThread)
      .where(and(eq(emailThread.id, id), eq(emailThread.userId, userId)))
      .limit(1);

    if (!thread) throw new NotFoundException('Thread not found');
    return thread;
  }

  async archiveThread(id: string, userId: string): Promise<EmailThread> {
    const [updated] = await this.drizzle.db
      .update(emailThread)
      .set({ unreadCount: 0 })
      .where(and(eq(emailThread.id, id), eq(emailThread.userId, userId)))
      .returning();

    if (!updated) throw new NotFoundException('Thread not found');
    return updated;
  }

  async deleteThread(id: string, userId: string): Promise<void> {
    const [deleted] = await this.drizzle.db
      .delete(emailThread)
      .where(and(eq(emailThread.id, id), eq(emailThread.userId, userId)))
      .returning({ id: emailThread.id });

    if (!deleted) throw new NotFoundException('Thread not found');
  }

  // ============================================================================
  // CONFIG MANAGEMENT
  // ============================================================================

  async getConfig(userId: string): Promise<AgentMailConfigRecord | null> {
    const [config] = await this.drizzle.db
      .select()
      .from(agentmailConfig)
      .where(eq(agentmailConfig.userId, userId))
      .limit(1);

    return config ?? null;
  }

  async saveConfig(userId: string, config: AgentMailConfig): Promise<AgentMailConfigRecord> {
    const [result] = await this.drizzle.db
      .insert(agentmailConfig)
      .values({
        userId,
        inboxId: config.inboxId,
        inboxEmail: config.inboxEmail,
        displayName: config.displayName,
        isActive: config.isActive,
      })
      .onConflictDoUpdate({
        target: agentmailConfig.userId,
        set: {
          inboxId: config.inboxId,
          inboxEmail: config.inboxEmail,
          displayName: config.displayName,
          isActive: config.isActive,
          updatedAt: new Date(),
        },
      })
      .returning();

    return result;
  }

  // ============================================================================
  // HELPERS
  // ============================================================================

  private async getUserConfig(userId: string): Promise<AgentMailConfigRecord> {
    const config = await this.getConfig(userId);
    if (!config) throw new NotFoundException('AgentMail not configured for user');
    return config;
  }
}
