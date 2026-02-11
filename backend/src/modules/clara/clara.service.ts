import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { eq } from "drizzle-orm";
import { DrizzleService } from "../../database";
import { user } from "../../auth/entities/auth.schema";
import { startup } from "../startup/entities/startup.schema";
import { AgentMailClientService } from "../integrations/agentmail/agentmail-client.service";
import { ClaraConversationService } from "./clara-conversation.service";
import { ClaraAiService } from "./clara-ai.service";
import { ClaraSubmissionService } from "./clara-submission.service";
import {
  ClaraIntent,
  ConversationStatus,
  MessageDirection,
  type AttachmentMeta,
  type MessageContext,
} from "./interfaces/clara.interface";

@Injectable()
export class ClaraService {
  private readonly logger = new Logger(ClaraService.name);
  private readonly claraInboxId: string | null;
  private readonly adminUserId: string | null;

  constructor(
    private config: ConfigService,
    private drizzle: DrizzleService,
    private agentMailClient: AgentMailClientService,
    private conversationService: ClaraConversationService,
    private claraAi: ClaraAiService,
    private submissionService: ClaraSubmissionService,
  ) {
    this.claraInboxId = this.config.get<string>("CLARA_INBOX_ID") ?? null;
    this.adminUserId =
      this.config.get<string>("CLARA_ADMIN_USER_ID") ?? null;

    if (this.claraInboxId) {
      this.logger.log(`Clara enabled for inbox ${this.claraInboxId}`);
    } else {
      this.logger.warn("Clara disabled (CLARA_INBOX_ID not set)");
    }
  }

  isEnabled(): boolean {
    return !!this.claraInboxId && !!this.adminUserId;
  }

  isClaraInbox(inboxId: string): boolean {
    return this.claraInboxId === inboxId;
  }

  async handleIncomingMessage(
    inboxId: string,
    threadId: string,
    messageId: string,
  ): Promise<void> {
    if (!this.claraInboxId || !this.adminUserId) {
      this.logger.warn("Clara not configured, skipping");
      return;
    }

    try {
      const message = await this.agentMailClient.getMessage(
        inboxId,
        messageId,
      );

      const fromEmail = message.from;
      const fromName = this.parseNameFromEmail(fromEmail);
      const investorUserId = await this.findInvestorByEmail(fromEmail);

      const conversation = await this.conversationService.findOrCreate(
        threadId,
        fromEmail,
        fromName,
        investorUserId,
      );

      const history =
        await this.conversationService.getRecentMessages(conversation.id);
      const startupContext = await this.getStartupExtra(conversation.startupId);

      const attachments: AttachmentMeta[] = (message.attachments ?? []).map(
        (a) => ({
          filename: a.filename ?? "attachment",
          contentType: a.contentType ?? "application/octet-stream",
          attachmentId: a.attachmentId,
          isPitchDeck:
            (a.contentType ?? "") === "application/pdf" ||
            /deck|pitch/i.test(a.filename ?? ""),
          status: "pending" as const,
        }),
      );

      const ctx: MessageContext = {
        threadId,
        messageId,
        inboxId,
        subject: message.subject ?? null,
        bodyText: message.text ?? null,
        fromEmail,
        fromName,
        attachments,
        conversationHistory: history,
        investorUserId,
        startupId: conversation.startupId,
        startupStage: startupContext.startupStage ?? null,
        conversationStatus: conversation.status as ConversationStatus,
      };

      const classification = await this.claraAi.classifyIntent(ctx);

      await this.conversationService.logMessage({
        conversationId: conversation.id,
        messageId,
        direction: MessageDirection.INBOUND,
        fromEmail,
        subject: message.subject,
        bodyText: message.text,
        intent: classification.intent,
        intentConfidence: classification.confidence,
        attachments,
        processed: true,
      });

      await this.conversationService.updateLastIntent(
        conversation.id,
        classification.intent,
      );

      let replyText: string;
      let extra: {
        startupName?: string;
        startupStatus?: string;
        score?: number;
        startupStage?: string;
      } = {};

      switch (classification.intent) {
        case ClaraIntent.SUBMISSION: {
          if (
            classification.confidence < 0.3 &&
            attachments.filter((a) => a.isPitchDeck).length === 0
          ) {
            await this.conversationService.updateStatus(
              conversation.id,
              ConversationStatus.AWAITING_INFO,
            );
            replyText = await this.claraAi.generateResponse(
              ClaraIntent.GREETING,
              ctx,
            );
            replyText +=
              "\n\nIt looks like you might want to submit a startup for analysis, but I couldn't find a pitch deck attachment. Could you please attach a PDF pitch deck?";
            break;
          }

          const result = await this.submissionService.handleSubmission(
            ctx,
            this.adminUserId,
            classification.extractedCompanyName,
          );

          await this.conversationService.linkStartup(
            conversation.id,
            result.startupId,
          );
          await this.conversationService.updateStatus(
            conversation.id,
            ConversationStatus.PROCESSING,
          );

          extra = {
            startupName: result.startupName,
            startupStatus: result.status,
            startupStage: startupContext.startupStage ?? "seed",
          };

          if (result.isDuplicate) {
            replyText = `We already have ${result.startupName} in our system (status: ${result.status}). I've linked this conversation to the existing record.`;
          } else {
            replyText = await this.claraAi.generateResponse(
              ClaraIntent.SUBMISSION,
              ctx,
              extra,
            );
          }
          break;
        }

        case ClaraIntent.QUESTION: {
          extra = await this.getStartupExtra(conversation.startupId);
          replyText = await this.claraAi.generateResponse(
            ClaraIntent.QUESTION,
            ctx,
            extra,
          );
          break;
        }

        case ClaraIntent.REPORT_REQUEST: {
          extra = await this.getStartupExtra(conversation.startupId);
          replyText = await this.claraAi.generateResponse(
            ClaraIntent.REPORT_REQUEST,
            ctx,
            extra,
          );
          break;
        }

        case ClaraIntent.FOLLOW_UP: {
          extra = await this.getStartupExtra(conversation.startupId);
          replyText = await this.claraAi.generateResponse(
            ClaraIntent.FOLLOW_UP,
            ctx,
            extra,
          );
          break;
        }

        case ClaraIntent.GREETING: {
          replyText = await this.claraAi.generateResponse(
            ClaraIntent.GREETING,
            ctx,
          );
          break;
        }
      }

      await this.agentMailClient.replyToMessage(inboxId, messageId, {
        text: replyText,
      });

      await this.conversationService.logMessage({
        conversationId: conversation.id,
        messageId: `reply-${messageId}`,
        direction: MessageDirection.OUTBOUND,
        fromEmail: `clara@agentmail.to`,
        bodyText: replyText,
        processed: true,
      });

      this.logger.log(
        `Processed message ${messageId}: intent=${classification.intent} confidence=${classification.confidence}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to handle message ${messageId}: ${error}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }
  }

  async notifyPipelineComplete(
    startupId: string,
    overallScore?: number,
  ): Promise<void> {
    if (!this.claraInboxId) return;

    const conversation =
      await this.conversationService.findByStartupId(startupId);
    if (!conversation) return;

    const [startupRecord] = await this.drizzle.db
      .select({ name: startup.name, status: startup.status })
      .from(startup)
      .where(eq(startup.id, startupId))
      .limit(1);

    if (!startupRecord) return;

    const scoreText = overallScore
      ? ` with an overall score of ${overallScore.toFixed(1)}/100`
      : "";

    const replyText = [
      `Hi ${conversation.investorName ?? "there"},`,
      "",
      `Great news! The analysis for ${startupRecord.name} is complete${scoreText}.`,
      "",
      "Our AI has evaluated the startup across multiple dimensions including team, market opportunity, product, traction, financials, competitive advantage, and more.",
      "",
      "You can reply to this email to ask questions about the analysis or request the full investment memo.",
      "",
      "Best,",
      "Clara",
    ].join("\n");

    await this.agentMailClient.sendMessage(this.claraInboxId, {
      to: [conversation.investorEmail],
      subject: `Analysis Complete: ${startupRecord.name}`,
      text: replyText,
    });

    await this.conversationService.logMessage({
      conversationId: conversation.id,
      messageId: `pipeline-complete-${startupId}`,
      direction: MessageDirection.OUTBOUND,
      fromEmail: `clara@agentmail.to`,
      subject: `Analysis Complete: ${startupRecord.name}`,
      bodyText: replyText,
      processed: true,
    });

    await this.conversationService.updateStatus(
      conversation.id,
      ConversationStatus.COMPLETED,
    );

    this.logger.log(
      `Sent pipeline completion notification for startup ${startupId} to ${conversation.investorEmail}`,
    );
  }

  private async findInvestorByEmail(
    email: string,
  ): Promise<string | null> {
    const [investor] = await this.drizzle.db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, email))
      .limit(1);

    if (investor) return investor.id;
    return null;
  }

  private parseNameFromEmail(email: string): string | null {
    const match = email.match(/^"?([^"<]+)"?\s*</);
    if (match) return match[1].trim();

    const localPart = email.split("@")[0];
    if (!localPart) return null;

    const parts = localPart.split(/[._-]/);
    if (parts.length >= 2) {
      return parts
        .map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
        .join(" ");
    }

    return null;
  }

  private async getStartupExtra(
    startupId: string | null,
  ): Promise<{
    startupName?: string;
    startupStatus?: string;
    score?: number;
    startupStage?: string;
  }> {
    if (!startupId) return {};

    const [record] = await this.drizzle.db
      .select({
        name: startup.name,
        status: startup.status,
        overallScore: startup.overallScore,
        stage: startup.stage,
      })
      .from(startup)
      .where(eq(startup.id, startupId))
      .limit(1);

    if (!record) return {};

    return {
      startupName: record.name,
      startupStatus: record.status,
      score: record.overallScore ?? undefined,
      startupStage: record.stage,
    };
  }
}
