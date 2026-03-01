import {
  Injectable,
  Logger,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { eq, and, or, desc } from 'drizzle-orm';
import { DrizzleService } from '../../../database';
import { NotificationService } from '../../../notification/notification.service';
import { StorageService } from '../../../storage';
import type { AssetType } from '../../../storage/storage.config';
import { integrationWebhook, WebhookSource } from '../../integration/entities/integration.schema';
import { TwilioApiClientService } from './twilio-api-client.service';
import type { TwilioWebhookDto, SendMessageDto, GetMessagesQueryDto } from './dto';

type WebhookPayload = {
  MessageSid: string;
  From: string;
  To: string;
  Body: string;
  MediaUrl?: string;
  MediaContentType?: string;
  Timestamp: string;
};

type ConversationMessage = {
  id: string;
  messageSid: string;
  from: string;
  to: string;
  body: string;
  mediaUrl?: string;
  mediaContentType?: string;
  timestamp: string;
  direction: 'incoming' | 'outgoing';
  createdAt: Date;
};

type Conversation = {
  conversationId: string;
  participants: string[];
  lastMessage: string;
  lastMessageAt: Date;
  messageCount: number;
};

@Injectable()
export class TwilioService {
  private readonly logger = new Logger(TwilioService.name);

  constructor(
    private drizzle: DrizzleService,
    private twilioClient: TwilioApiClientService,
    private notification: NotificationService,
    private storage: StorageService,
    private config: ConfigService,
  ) {}

  private normalizePhoneNumber(phone: string): string {
    return phone.replace('whatsapp:', '').trim();
  }

  private getConversationId(from: string, to: string): string {
    const [a, b] = [this.normalizePhoneNumber(from), this.normalizePhoneNumber(to)].sort();
    return `${a}:${b}`;
  }

  private async downloadMedia(mediaUrl: string, userId: string): Promise<string | null> {
    try {
      const response = await fetch(mediaUrl);
      if (!response.ok) {
        throw new Error(`Failed to download media: ${response.statusText}`);
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      const contentType = response.headers.get('content-type') || 'application/octet-stream';

      const result = await this.storage.uploadGeneratedContent(
        userId,
        'documents' as AssetType,
        buffer,
        contentType,
      );

      return result.url;
    } catch (error) {
      this.logger.error('Failed to download media', error);
      return null;
    }
  }

  async handleWebhook(payload: TwilioWebhookDto, signature: string, url: string) {
    const isValid = this.twilioClient.validateWebhook(signature, url, payload as unknown as Record<string, string>);

    if (!isValid) {
      this.logger.warn('Invalid Twilio webhook signature');
      throw new UnauthorizedException('Invalid webhook signature');
    }

    const webhookPayload: WebhookPayload = {
      MessageSid: payload.MessageSid,
      From: payload.From,
      To: payload.To,
      Body: payload.Body || '',
      MediaUrl: payload.MediaUrl0,
      MediaContentType: payload.MediaContentType0,
      Timestamp: payload.Timestamp || new Date().toISOString(),
    };

    try {
      const [webhook] = await this.drizzle.db
        .insert(integrationWebhook)
        .values({
          source: WebhookSource.TWILIO,
          eventType: 'message.received',
          payload: webhookPayload as unknown as Record<string, unknown>,
          processed: false,
        })
        .returning();

      this.logger.log(`Logged webhook: ${webhook.id}`);

      // Download media if attached
      if (webhookPayload.MediaUrl) {
        await this.downloadMedia(webhookPayload.MediaUrl, 'system');
      }

      // Note: In production, map phone number to userId for notifications
      // const recipient = this.normalizePhoneNumber(webhookPayload.To);
      // const sender = this.normalizePhoneNumber(webhookPayload.From);
      // const title = storedMediaUrl ? `New WhatsApp with attachment from ${sender}` : `New WhatsApp from ${sender}`;
      // const message = webhookPayload.Body || '[Media]';
      // await this.notification.create(recipientUserId, title, message, NotificationType.INFO);

      await this.drizzle.db
        .update(integrationWebhook)
        .set({ processed: true })
        .where(eq(integrationWebhook.id, webhook.id));

      return { success: true, webhookId: webhook.id };
    } catch (error) {
      this.logger.error('Failed to process webhook', error);

      await this.drizzle.db
        .insert(integrationWebhook)
        .values({
          source: WebhookSource.TWILIO,
          eventType: 'message.received',
          payload: webhookPayload as unknown as Record<string, unknown>,
          processed: false,
          errorMessage: error instanceof Error ? error.message : 'Unknown error',
        });

      throw error;
    }
  }

  async sendMessage(userId: string, dto: SendMessageDto) {
    const whatsappNumber = this.config.get<string>('TWILIO_WHATSAPP_NUMBER');

    if (!whatsappNumber) {
      throw new BadRequestException('Twilio WhatsApp number not configured');
    }

    const from = `whatsapp:${whatsappNumber}`;
    const to = `whatsapp:${dto.to}`;

    const message = await this.twilioClient.sendMessage({
      from,
      to,
      body: dto.body,
      mediaUrl: dto.mediaUrl ? [dto.mediaUrl] : undefined,
    });

    const webhookPayload: WebhookPayload = {
      MessageSid: message.sid,
      From: from,
      To: to,
      Body: dto.body,
      MediaUrl: dto.mediaUrl,
      Timestamp: new Date().toISOString(),
    };

    await this.drizzle.db.insert(integrationWebhook).values({
      source: WebhookSource.TWILIO,
      eventType: 'message.sent',
      payload: webhookPayload as unknown as Record<string, unknown>,
      processed: true,
    });

    this.logger.log(`Sent message ${message.sid} to ${dto.to}`);

    return {
      messageSid: message.sid,
      status: message.status,
      to: dto.to,
      body: dto.body,
    };
  }

  async getMessages(userId: string, query: GetMessagesQueryDto) {
    const { page, limit, conversationId } = query;
    const offset = (page - 1) * limit;

    if (conversationId) {
      return this.getConversation(userId, conversationId, page, limit);
    }

    const whatsappNumber = this.config.get<string>('TWILIO_WHATSAPP_NUMBER');
    if (!whatsappNumber) {
      throw new BadRequestException('Twilio WhatsApp number not configured');
    }

    const webhooks = await this.drizzle.db
      .select()
      .from(integrationWebhook)
      .where(
        and(
          eq(integrationWebhook.source, WebhookSource.TWILIO),
          or(
            eq(integrationWebhook.eventType, 'message.received'),
            eq(integrationWebhook.eventType, 'message.sent'),
          ),
        ),
      )
      .orderBy(desc(integrationWebhook.createdAt));

    const conversationsMap = new Map<string, Conversation>();

    for (const webhook of webhooks) {
      const payload = webhook.payload as unknown as WebhookPayload;
      const convId = this.getConversationId(payload.From, payload.To);

      if (!conversationsMap.has(convId)) {
        conversationsMap.set(convId, {
          conversationId: convId,
          participants: [
            this.normalizePhoneNumber(payload.From),
            this.normalizePhoneNumber(payload.To),
          ],
          lastMessage: payload.Body,
          lastMessageAt: webhook.createdAt,
          messageCount: 1,
        });
      } else {
        const conv = conversationsMap.get(convId)!;
        conv.messageCount++;
      }
    }

    const conversations = Array.from(conversationsMap.values())
      .sort((a, b) => b.lastMessageAt.getTime() - a.lastMessageAt.getTime())
      .slice(offset, offset + limit);

    return {
      data: conversations,
      meta: {
        total: conversationsMap.size,
        page,
        limit,
        totalPages: Math.ceil(conversationsMap.size / limit),
      },
    };
  }

  async getConversation(userId: string, conversationId: string, page = 1, limit = 50) {
    const offset = (page - 1) * limit;
    const webhooks = await this.drizzle.db
      .select()
      .from(integrationWebhook)
      .where(
        and(
          eq(integrationWebhook.source, WebhookSource.TWILIO),
          or(
            eq(integrationWebhook.eventType, 'message.received'),
            eq(integrationWebhook.eventType, 'message.sent'),
          ),
        ),
      )
      .orderBy(desc(integrationWebhook.createdAt));

    const whatsappNumber = this.config.get<string>('TWILIO_WHATSAPP_NUMBER');
    const normalizedWhatsappNumber = whatsappNumber
      ? this.normalizePhoneNumber(whatsappNumber)
      : '';

    const messages: ConversationMessage[] = webhooks
      .filter((webhook) => {
        const payload = webhook.payload as unknown as WebhookPayload;
        const convId = this.getConversationId(payload.From, payload.To);
        return convId === conversationId;
      })
      .map((webhook) => {
        const payload = webhook.payload as unknown as WebhookPayload;
        const isOutgoing =
          this.normalizePhoneNumber(payload.From) === normalizedWhatsappNumber;

        return {
          id: webhook.id,
          messageSid: payload.MessageSid,
          from: this.normalizePhoneNumber(payload.From),
          to: this.normalizePhoneNumber(payload.To),
          body: payload.Body,
          mediaUrl: payload.MediaUrl,
          mediaContentType: payload.MediaContentType,
          timestamp: payload.Timestamp,
          direction: isOutgoing ? ('outgoing' as const) : ('incoming' as const),
          createdAt: webhook.createdAt,
        };
      })
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    const paginatedMessages = messages.slice(offset, offset + limit);

    return {
      data: paginatedMessages,
      meta: {
        total: messages.length,
        page,
        limit,
        totalPages: Math.ceil(messages.length / limit),
      },
    };
  }

  async getConfig(_userId: string) {
    // In production, fetch from user-specific config table
    // For now, return global config (masked)
    const whatsappNumber = this.config.get<string>('TWILIO_WHATSAPP_NUMBER');

    return {
      whatsappNumber: whatsappNumber || null,
      configured: !!whatsappNumber,
    };
  }

  async saveConfig(_userId: string, _config: { accountSid: string; authToken: string; whatsappNumber: string }) {
    // In production, save to user-specific config table
    // For now, this is a no-op since we use global env vars
    this.logger.warn('saveConfig called but not implemented (using global env config)');

    return {
      success: true,
      message: 'Config saved (Note: Currently using global env configuration)',
    };
  }
}
