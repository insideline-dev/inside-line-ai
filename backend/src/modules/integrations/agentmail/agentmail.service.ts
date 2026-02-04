import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { eq, and, desc, gt, count as drizzleCount } from 'drizzle-orm';
import { DrizzleService } from '../../../database';
import {
  integrationWebhook,
  emailThread,
  WebhookSource,
  type IntegrationWebhook,
  type EmailThread,
  type NewEmailThread,
} from '../../integration/entities';
import { NotificationService } from '../../../notification/notification.service';
import { NotificationType } from '../../../notification/entities';
import { AttachmentService } from './attachment.service';
import type { AgentMailWebhook, GetThreadsQuery, AgentMailConfig } from './dto';

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
  ) {}

  async handleWebhook(payload: AgentMailWebhook): Promise<void> {
    const webhookPayload: Record<string, unknown> = payload as unknown as Record<string, unknown>;

    try {
      // Log webhook event
      await this.drizzle.db.insert(integrationWebhook).values({
        source: WebhookSource.AGENTMAIL,
        eventType: payload.event,
        payload: webhookPayload,
        processed: false,
      });

      // Process email
      await this.processEmail(payload);

      // Mark webhook as processed
      await this.drizzle.db
        .update(integrationWebhook)
        .set({ processed: true })
        .where(
          and(
            eq(integrationWebhook.source, WebhookSource.AGENTMAIL),
            eq(integrationWebhook.eventType, payload.event),
          ),
        );

      this.logger.log(`Processed webhook: ${payload.event} for thread ${payload.thread_id}`);
    } catch (error) {
      this.logger.error(`Webhook processing failed: ${error.message}`, error);

      await this.drizzle.db
        .update(integrationWebhook)
        .set({
          processed: false,
          errorMessage: error.message,
        })
        .where(
          and(
            eq(integrationWebhook.source, WebhookSource.AGENTMAIL),
            eq(integrationWebhook.eventType, payload.event),
          ),
        );

      throw error;
    }
  }

  private async processEmail(payload: AgentMailWebhook): Promise<void> {
    const { thread_id, message } = payload;

    // Find existing thread or create new one
    const [existingThread] = await this.drizzle.db
      .select()
      .from(emailThread)
      .where(eq(emailThread.threadId, thread_id))
      .limit(1);

    if (existingThread) {
      // Update existing thread
      await this.drizzle.db
        .update(emailThread)
        .set({
          lastMessageAt: new Date(message.timestamp),
          unreadCount: existingThread.unreadCount + 1,
        })
        .where(eq(emailThread.id, existingThread.id));

      this.logger.log(`Updated thread ${thread_id}`);
    } else {
      // Create new thread
      const participants = [message.from, ...message.to];
      const newThread: NewEmailThread = {
        userId: await this.findUserByInbox(thread_id),
        threadId: thread_id,
        subject: message.subject,
        participants,
        lastMessageAt: new Date(message.timestamp),
        unreadCount: 1,
      };

      await this.drizzle.db.insert(emailThread).values(newThread);
      this.logger.log(`Created new thread ${thread_id}`);
    }

    // Download attachments asynchronously
    if (message.attachments.length > 0) {
      const userId = existingThread?.userId ?? (await this.findUserByInbox(thread_id));
      await this.attachmentService.downloadMultiple(userId, message.attachments);
    }

    // Create notification
    const userId = existingThread?.userId ?? (await this.findUserByInbox(thread_id));
    const isPriority = this.isPriorityEmail(message.subject);

    await this.notificationService.create(
      userId,
      `New email from ${message.from}`,
      message.subject,
      isPriority ? NotificationType.WARNING : NotificationType.INFO,
      `/integrations/agentmail/threads/${thread_id}`,
    );
  }

  private async findUserByInbox(threadId: string): Promise<string> {
    // TODO: Implement inbox-to-user mapping via config table
    // For now, return a placeholder
    // In production, query agentmail_config table to find userId by inboxId
    return 'user-placeholder';
  }

  private isPriorityEmail(subject: string): boolean {
    const priorityKeywords = ['urgent', 'follow-up', 'important', 'asap'];
    return priorityKeywords.some((keyword) =>
      subject.toLowerCase().includes(keyword),
    );
  }

  async findThreads(userId: string, query: GetThreadsQuery): Promise<PaginatedThreads> {
    const { page, limit, unread } = query;
    const offset = (page - 1) * limit;

    const conditions = [eq(emailThread.userId, userId)];
    if (unread !== undefined) {
      if (unread) {
        // Unread threads have unreadCount > 0
        conditions.push(gt(emailThread.unreadCount, 0));
      } else {
        // Read threads have unreadCount = 0
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
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findThread(id: string, userId: string): Promise<EmailThread> {
    const [thread] = await this.drizzle.db
      .select()
      .from(emailThread)
      .where(and(eq(emailThread.id, id), eq(emailThread.userId, userId)))
      .limit(1);

    if (!thread) {
      throw new NotFoundException('Thread not found');
    }

    return thread;
  }

  async archiveThread(id: string, userId: string): Promise<EmailThread> {
    // Note: Schema doesn't have archivedAt field, so we'll mark unreadCount as 0
    const [updated] = await this.drizzle.db
      .update(emailThread)
      .set({ unreadCount: 0 })
      .where(and(eq(emailThread.id, id), eq(emailThread.userId, userId)))
      .returning();

    if (!updated) {
      throw new NotFoundException('Thread not found');
    }

    return updated;
  }

  async deleteThread(id: string, userId: string): Promise<void> {
    const [deleted] = await this.drizzle.db
      .delete(emailThread)
      .where(and(eq(emailThread.id, id), eq(emailThread.userId, userId)))
      .returning({ id: emailThread.id });

    if (!deleted) {
      throw new NotFoundException('Thread not found');
    }
  }

  async getConfig(userId: string): Promise<AgentMailConfig | null> {
    // TODO: Implement config storage
    // For now, return null
    return null;
  }

  async saveConfig(userId: string, config: AgentMailConfig): Promise<AgentMailConfig> {
    // TODO: Implement config storage
    // For now, return the config as-is
    return config;
  }
}
