import { Injectable, Logger } from "@nestjs/common";
import { and, eq, desc, sql, isNotNull, ne } from "drizzle-orm";
import { DrizzleService } from "../../database";
import {
  claraConversation,
  type ClaraConversationRecord,
  type NewClaraConversationRecord,
} from "./entities/clara-conversation.schema";
import {
  claraMessage,
  type NewClaraMessageRecord,
} from "./entities/clara-message.schema";
import {
  ConversationStatus,
  MessageDirection,
  type AttachmentMeta,
  type ConversationMessage,
} from "./interfaces/clara.interface";

@Injectable()
export class ClaraConversationService {
  private readonly logger = new Logger(ClaraConversationService.name);

  constructor(private drizzle: DrizzleService) {}

  async findByThreadId(
    threadId: string,
  ): Promise<ClaraConversationRecord | null> {
    const [row] = await this.drizzle.db
      .select()
      .from(claraConversation)
      .where(eq(claraConversation.threadId, threadId))
      .limit(1);
    return row ?? null;
  }

  async findByChannelThread(
    channel: string,
    externalThreadId: string,
  ): Promise<ClaraConversationRecord | null> {
    const [row] = await this.drizzle.db
      .select()
      .from(claraConversation)
      .where(
        and(
          eq(claraConversation.channel, channel),
          eq(claraConversation.externalThreadId, externalThreadId),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  async findOrCreate(
    threadId: string,
    investorEmail: string,
    investorName: string | null,
    investorUserId: string | null,
    options?: {
      channel?: string;
      externalThreadId?: string | null;
      normalizedPhone?: string | null;
      providerMetadata?: Record<string, unknown> | null;
    },
  ): Promise<ClaraConversationRecord> {
    const existing = options?.channel && options.externalThreadId
      ? await this.findByChannelThread(options.channel, options.externalThreadId)
      : await this.findByThreadId(threadId);
    if (existing) {
      const shouldRefreshIdentity =
        existing.investorEmail !== investorEmail ||
        (existing.investorName == null && investorName != null) ||
        (existing.investorUserId == null && investorUserId != null);

      if (shouldRefreshIdentity) {
        const [updated] = await this.drizzle.db
          .update(claraConversation)
          .set({
            investorEmail,
            investorName: investorName ?? existing.investorName,
            investorUserId: investorUserId ?? existing.investorUserId,
            normalizedPhone: options?.normalizedPhone ?? existing.normalizedPhone,
            providerMetadata: options?.providerMetadata ?? existing.providerMetadata,
            updatedAt: new Date(),
          })
          .where(eq(claraConversation.id, existing.id))
          .returning();

        return updated ?? {
          ...existing,
          investorEmail,
          investorName: investorName ?? existing.investorName,
          investorUserId: investorUserId ?? existing.investorUserId,
          normalizedPhone: options?.normalizedPhone ?? existing.normalizedPhone,
          providerMetadata: options?.providerMetadata ?? existing.providerMetadata,
        };
      }

      return existing;
    }

    const values: NewClaraConversationRecord = {
      threadId,
      channel: options?.channel ?? "email",
      externalThreadId: options?.externalThreadId ?? threadId,
      normalizedPhone: options?.normalizedPhone ?? null,
      providerMetadata: options?.providerMetadata ?? {},
      investorEmail,
      investorName,
      investorUserId,
    };

    const [created] = await this.drizzle.db
      .insert(claraConversation)
      .values(values)
      .returning();

    this.logger.log(
      `Created conversation ${created.id} for thread ${threadId}`,
    );
    return created;
  }

  async updateStatus(
    conversationId: string,
    status: ConversationStatus,
  ): Promise<void> {
    await this.drizzle.db
      .update(claraConversation)
      .set({ status, updatedAt: new Date() })
      .where(eq(claraConversation.id, conversationId));
  }

  async linkStartup(
    conversationId: string,
    startupId: string,
  ): Promise<void> {
    await this.drizzle.db
      .update(claraConversation)
      .set({ startupId, updatedAt: new Date() })
      .where(eq(claraConversation.id, conversationId));
  }

  async updateLastIntent(
    conversationId: string,
    intent: string,
  ): Promise<void> {
    await this.drizzle.db
      .update(claraConversation)
      .set({ lastIntent: intent, updatedAt: new Date() })
      .where(eq(claraConversation.id, conversationId));
  }

  async updateContext(
    conversationId: string,
    context: Record<string, unknown>,
  ): Promise<void> {
    await this.drizzle.db
      .update(claraConversation)
      .set({ context, updatedAt: new Date() })
      .where(eq(claraConversation.id, conversationId));
  }

  async findByStartupId(
    startupId: string,
  ): Promise<ClaraConversationRecord | null> {
    const [row] = await this.drizzle.db
      .select()
      .from(claraConversation)
      .where(eq(claraConversation.startupId, startupId))
      .limit(1);
    return row ?? null;
  }

  async findByStartupIdAndChannel(
    startupId: string,
    channel: string,
  ): Promise<ClaraConversationRecord | null> {
    const [row] = await this.drizzle.db
      .select()
      .from(claraConversation)
      .where(
        and(
          eq(claraConversation.startupId, startupId),
          eq(claraConversation.channel, channel),
        ),
      )
      .orderBy(desc(claraConversation.lastMessageAt))
      .limit(1);
    return row ?? null;
  }

  async findLatestAwaitingInfoByInvestorEmail(
    investorEmail: string,
    excludeConversationId?: string,
  ): Promise<ClaraConversationRecord | null> {
    const baseConditions = [
      eq(claraConversation.investorEmail, investorEmail),
      eq(claraConversation.status, ConversationStatus.AWAITING_INFO),
      isNotNull(claraConversation.startupId),
    ];
    const conditions =
      excludeConversationId && excludeConversationId.trim().length > 0
        ? [...baseConditions, ne(claraConversation.id, excludeConversationId)]
        : baseConditions;

    const [row] = await this.drizzle.db
      .select()
      .from(claraConversation)
      .where(and(...conditions))
      .orderBy(desc(claraConversation.lastMessageAt))
      .limit(1);

    return row ?? null;
  }

  async findLatestByInvestorEmailWithStartup(
    investorEmail: string,
    excludeConversationId?: string,
  ): Promise<ClaraConversationRecord | null> {
    const baseConditions = [
      eq(claraConversation.investorEmail, investorEmail),
      isNotNull(claraConversation.startupId),
    ];
    const conditions =
      excludeConversationId && excludeConversationId.trim().length > 0
        ? [...baseConditions, ne(claraConversation.id, excludeConversationId)]
        : baseConditions;

    const [row] = await this.drizzle.db
      .select()
      .from(claraConversation)
      .where(and(...conditions))
      .orderBy(desc(claraConversation.lastMessageAt))
      .limit(1);

    return row ?? null;
  }

  async logMessage(params: {
    conversationId: string;
    messageId: string;
    direction: MessageDirection;
    fromEmail: string;
    subject?: string | null;
    bodyText?: string | null;
    intent?: string | null;
    intentConfidence?: number | null;
    attachments?: AttachmentMeta[] | null;
    processed?: boolean;
    errorMessage?: string | null;
    channel?: string;
    externalMessageId?: string | null;
    providerMetadata?: Record<string, unknown> | null;
  }): Promise<void> {
    const alreadyLogged = await this.hasMessage(
      params.conversationId,
      params.messageId,
      params.direction,
    );
    if (alreadyLogged) {
      this.logger.debug(
        `Skipping duplicate Clara message log: conv=${params.conversationId} msg=${params.messageId} dir=${params.direction}`,
      );
      return;
    }

    const values: NewClaraMessageRecord = {
      conversationId: params.conversationId,
      messageId: params.messageId,
      channel: params.channel ?? "email",
      externalMessageId: params.externalMessageId ?? params.messageId,
      providerMetadata: params.providerMetadata ?? {},
      direction: params.direction,
      fromEmail: params.fromEmail,
      subject: params.subject ?? null,
      bodyText: params.bodyText ?? null,
      intent: params.intent ?? null,
      intentConfidence: params.intentConfidence ?? null,
      attachments: params.attachments ?? null,
      processed: params.processed ?? false,
      errorMessage: params.errorMessage ?? null,
    };

    await this.drizzle.db.transaction(async (tx) => {
      await tx.insert(claraMessage).values(values);
      await tx
        .update(claraConversation)
        .set({
          messageCount: sql`${claraConversation.messageCount} + 1`,
          lastMessageAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(claraConversation.id, params.conversationId));
    });
  }

  async hasMessage(
    conversationId: string,
    messageId: string,
    direction: MessageDirection,
  ): Promise<boolean> {
    const rows = await this.drizzle.db
      .select({ id: claraMessage.id })
      .from(claraMessage)
      .where(
        and(
          eq(claraMessage.conversationId, conversationId),
          eq(claraMessage.messageId, messageId),
          eq(claraMessage.direction, direction),
        ),
      )
      .limit(1);

    return Array.isArray(rows) && rows.length > 0;
  }

  async getRecentMessages(
    conversationId: string,
    limit = 10,
  ): Promise<ConversationMessage[]> {
    const rows = await this.drizzle.db
      .select({
        direction: claraMessage.direction,
        bodyText: claraMessage.bodyText,
        subject: claraMessage.subject,
        intent: claraMessage.intent,
        createdAt: claraMessage.createdAt,
      })
      .from(claraMessage)
      .where(eq(claraMessage.conversationId, conversationId))
      .orderBy(desc(claraMessage.createdAt))
      .limit(limit);

    return rows.reverse();
  }
}
