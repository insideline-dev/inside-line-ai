import { Injectable, Logger } from "@nestjs/common";
import { eq, desc, sql } from "drizzle-orm";
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

  async findOrCreate(
    threadId: string,
    investorEmail: string,
    investorName: string | null,
    investorUserId: string | null,
  ): Promise<ClaraConversationRecord> {
    const existing = await this.findByThreadId(threadId);
    if (existing) {
      return existing;
    }

    const values: NewClaraConversationRecord = {
      threadId,
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
  }): Promise<void> {
    const values: NewClaraMessageRecord = {
      conversationId: params.conversationId,
      messageId: params.messageId,
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

    await this.drizzle.db.insert(claraMessage).values(values);

    await this.drizzle.db
      .update(claraConversation)
      .set({
        messageCount: sql`${claraConversation.messageCount} + 1`,
        lastMessageAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(claraConversation.id, params.conversationId));
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
