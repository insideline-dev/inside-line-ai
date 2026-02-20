import { Injectable, Logger } from "@nestjs/common";
import { eq, desc } from "drizzle-orm";
import { DrizzleService } from "../../../database";
import { claraConversation } from "../../clara/entities/clara-conversation.schema";
import { claraMessage } from "../../clara/entities/clara-message.schema";
import type { ClaraEmailContext } from "../interfaces/phase-results.interface";

const MAX_MESSAGES_PER_CONVERSATION = 10;
const MAX_BODY_LENGTH = 2000;

@Injectable()
export class ClaraEmailContextService {
  private readonly logger = new Logger(ClaraEmailContextService.name);

  constructor(private drizzle: DrizzleService) {}

  async getEmailContext(startupId: string): Promise<ClaraEmailContext | null> {
    try {
      const conversations = await this.drizzle.db
        .select()
        .from(claraConversation)
        .where(eq(claraConversation.startupId, startupId))
        .orderBy(desc(claraConversation.lastMessageAt));

      if (conversations.length === 0) {
        return null;
      }

      const result: ClaraEmailContext = {
        conversations: [],
        summary: "",
      };

      for (const conv of conversations) {
        const messages = await this.drizzle.db
          .select({
            subject: claraMessage.subject,
            bodyText: claraMessage.bodyText,
            direction: claraMessage.direction,
          })
          .from(claraMessage)
          .where(eq(claraMessage.conversationId, conv.id))
          .orderBy(desc(claraMessage.createdAt))
          .limit(MAX_MESSAGES_PER_CONVERSATION);

        result.conversations.push({
          investorEmail: conv.investorEmail,
          investorName: conv.investorName,
          messages: messages.map((m) => ({
            subject: m.subject,
            bodyText: m.bodyText
              ? m.bodyText.slice(0, MAX_BODY_LENGTH)
              : null,
            direction: m.direction,
          })),
        });
      }

      result.summary = this.buildSummary(result);
      return result;
    } catch (error) {
      this.logger.warn(
        `Failed to fetch Clara email context for startup ${startupId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return null;
    }
  }

  private buildSummary(context: ClaraEmailContext): string {
    if (context.conversations.length === 0) {
      return "No email conversations found.";
    }

    const sections: string[] = [];
    for (const conv of context.conversations) {
      const from = conv.investorName
        ? `${conv.investorName} (${conv.investorEmail})`
        : conv.investorEmail;
      sections.push(`From: ${from}`);

      for (const msg of conv.messages) {
        if (msg.subject) {
          sections.push(`  Subject: ${msg.subject}`);
        }
        if (msg.bodyText) {
          sections.push(`  [${msg.direction}]: ${msg.bodyText}`);
        }
      }
      sections.push("");
    }

    return sections.join("\n").trim();
  }
}
