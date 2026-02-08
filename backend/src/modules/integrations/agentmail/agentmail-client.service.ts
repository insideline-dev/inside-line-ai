import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AgentMailClient, AgentMail } from 'agentmail';

@Injectable()
export class AgentMailClientService {
  private readonly logger = new Logger(AgentMailClientService.name);
  private readonly client: AgentMailClient | null;

  constructor(private configService: ConfigService) {
    const apiKey = this.configService.get<string>('AGENTMAIL_API_KEY');

    if (apiKey) {
      this.client = new AgentMailClient({ apiKey });
      this.logger.log('AgentMail SDK client configured');
    } else {
      this.client = null;
      this.logger.warn('AgentMail SDK not configured (missing AGENTMAIL_API_KEY)');
    }
  }

  isConfigured(): boolean {
    return this.client !== null;
  }

  private ensureConfigured(): AgentMailClient {
    if (!this.client) {
      throw new ServiceUnavailableException('AgentMail integration not configured');
    }
    return this.client;
  }

  // ============================================================================
  // INBOXES
  // ============================================================================

  async createInbox(options?: { username?: string; displayName?: string }) {
    const client = this.ensureConfigured();
    return client.inboxes.create({
      username: options?.username,
      displayName: options?.displayName,
    });
  }

  async listInboxes(limit?: number, pageToken?: string) {
    const client = this.ensureConfigured();
    return client.inboxes.list({ limit, pageToken });
  }

  async getInbox(inboxId: string) {
    const client = this.ensureConfigured();
    return client.inboxes.get(inboxId);
  }

  async deleteInbox(inboxId: string) {
    const client = this.ensureConfigured();
    return client.inboxes.delete(inboxId);
  }

  // ============================================================================
  // MESSAGES
  // ============================================================================

  async sendMessage(
    inboxId: string,
    params: {
      to: string[];
      subject?: string;
      text?: string;
      html?: string;
      cc?: string[];
      bcc?: string[];
      attachments?: AgentMail.SendAttachment[];
    },
  ) {
    const client = this.ensureConfigured();
    return client.inboxes.messages.send(inboxId, params);
  }

  async replyToMessage(
    inboxId: string,
    messageId: string,
    params: {
      text?: string;
      html?: string;
      attachments?: AgentMail.SendAttachment[];
    },
  ) {
    const client = this.ensureConfigured();
    return client.inboxes.messages.reply(inboxId, messageId, params);
  }

  async listMessages(
    inboxId: string,
    options?: {
      limit?: number;
      pageToken?: string;
      before?: Date;
      after?: Date;
      ascending?: boolean;
    },
  ) {
    const client = this.ensureConfigured();
    return client.inboxes.messages.list(inboxId, options);
  }

  async getMessage(inboxId: string, messageId: string) {
    const client = this.ensureConfigured();
    return client.inboxes.messages.get(inboxId, messageId);
  }

  async getMessageAttachment(inboxId: string, messageId: string, attachmentId: string) {
    const client = this.ensureConfigured();
    return client.inboxes.messages.getAttachment(inboxId, messageId, attachmentId);
  }

  // ============================================================================
  // THREADS
  // ============================================================================

  async listThreads(
    inboxId: string,
    options?: {
      limit?: number;
      pageToken?: string;
      before?: Date;
      after?: Date;
      ascending?: boolean;
    },
  ) {
    const client = this.ensureConfigured();
    return client.inboxes.threads.list(inboxId, options);
  }

  async getThread(threadId: string) {
    const client = this.ensureConfigured();
    return client.threads.get(threadId);
  }

  // ============================================================================
  // WEBHOOKS
  // ============================================================================

  async listWebhooks(limit?: number, pageToken?: string) {
    const client = this.ensureConfigured();
    return client.webhooks.list({ limit, pageToken });
  }

  async createWebhook(params: {
    url: string;
    eventTypes: AgentMail.EventType[];
    inboxIds?: string[];
  }) {
    const client = this.ensureConfigured();
    return client.webhooks.create(params);
  }

  async deleteWebhook(webhookId: string) {
    const client = this.ensureConfigured();
    return client.webhooks.delete(webhookId);
  }

  async getWebhook(webhookId: string) {
    const client = this.ensureConfigured();
    return client.webhooks.get(webhookId);
  }
}
