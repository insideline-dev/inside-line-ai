import { Injectable, Logger, NotFoundException, Optional, Inject, forwardRef } from '@nestjs/common';
import { eq, and, desc, gt, count as drizzleCount } from 'drizzle-orm';
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

@Injectable()
export class AgentMailService {
  private readonly logger = new Logger(AgentMailService.name);

  constructor(
    private drizzle: DrizzleService,
    private notificationService: NotificationService,
    private attachmentService: AttachmentService,
    private agentMailClient: AgentMailClientService,
    @Optional() @Inject(forwardRef(() => ClaraService)) private claraService: ClaraService | null,
  ) {}

  // ============================================================================
  // WEBHOOK HANDLING (ID-only payload -> fetch full message via SDK)
  // ============================================================================

  async handleWebhook(payload: AgentMailWebhook): Promise<void> {
    const webhookPayload: Record<string, unknown> = payload as unknown as Record<string, unknown>;
    let webhookRowId: string | null = null;

    try {
      const [inserted] = await this.drizzle.db
        .insert(integrationWebhook)
        .values({
          source: WebhookSource.AGENTMAIL,
          eventType: 'message.received',
          payload: webhookPayload,
          processed: false,
        })
        .returning({ id: integrationWebhook.id });
      webhookRowId = inserted?.id ?? null;

      await this.processWebhookEvent(payload);

      if (webhookRowId) {
        await this.drizzle.db
          .update(integrationWebhook)
          .set({ processed: true })
          .where(eq(integrationWebhook.id, webhookRowId));
      }

      this.logger.log(
        `Processed webhook: message ${payload.message_id} in thread ${payload.thread_id}`,
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
    const { inbox_id, thread_id, message_id } = payload;

    // Route to Clara if this is Clara's inbox
    if (this.claraService?.isClaraInbox(inbox_id)) {
      this.logger.log(`Routing message ${message_id} to Clara`);
      await this.claraService.handleIncomingMessage(inbox_id, thread_id, message_id);
      return;
    }

    const userId = await this.findUserByInbox(inbox_id);
    if (!userId) {
      this.logger.warn(`No user found for inbox ${inbox_id}, skipping`);
      return;
    }

    let message;
    try {
      message = await this.agentMailClient.getMessage(inbox_id, message_id);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to fetch message ${message_id} from SDK: ${errorMessage}`, error);
      throw new Error(`SDK getMessage failed: ${errorMessage}`);
    }

    // Find existing thread or create new one
    const [existingThread] = await this.drizzle.db
      .select()
      .from(emailThread)
      .where(eq(emailThread.threadId, thread_id))
      .limit(1);

    if (existingThread) {
      await this.drizzle.db
        .update(emailThread)
        .set({
          lastMessageAt: new Date(message.timestamp),
          unreadCount: existingThread.unreadCount + 1,
        })
        .where(eq(emailThread.id, existingThread.id));
    } else {
      const participants = [message.from, ...message.to];
      const newThread: NewEmailThread = {
        userId,
        threadId: thread_id,
        subject: message.subject ?? '(no subject)',
        participants,
        lastMessageAt: new Date(message.timestamp),
        unreadCount: 1,
      };
      await this.drizzle.db.insert(emailThread).values(newThread);
    }

    // Download attachments asynchronously
    if (message.attachments && message.attachments.length > 0) {
      const attachmentDownloads = message.attachments.map((att) => ({
        filename: att.filename ?? 'attachment',
        content_type: att.contentType ?? 'application/octet-stream',
        attachmentId: att.attachmentId,
        inboxId: inbox_id,
        messageId: message_id,
      }));
      await this.attachmentService.downloadFromSdk(
        userId,
        inbox_id,
        message_id,
        attachmentDownloads,
        this.agentMailClient,
      );
    }

    // Create notification
    const subject = message.subject ?? '(no subject)';
    const isPriority = this.isPriorityEmail(subject);

    await this.notificationService.create(
      userId,
      `New email from ${message.from}`,
      subject,
      isPriority ? NotificationType.WARNING : NotificationType.INFO,
      `/integrations/agentmail/threads/${thread_id}`,
    );
  }

  private async findUserByInbox(inboxId: string): Promise<string | null> {
    const [config] = await this.drizzle.db
      .select()
      .from(agentmailConfig)
      .where(eq(agentmailConfig.inboxId, inboxId))
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
