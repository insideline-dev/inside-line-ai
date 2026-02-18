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
import { ClaraToolsService } from "./clara-tools.service";
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
    private toolsService: ClaraToolsService,
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

      const rawFrom = message.from;
      const fromEmail = this.extractEmailAddress(rawFrom);
      const fromName = this.parseNameFromEmail(rawFrom);
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

      let replyText: string;
      let intent: ClaraIntent;

      if (this.claraAi.isLikelySubmission(ctx)) {
        intent = ClaraIntent.SUBMISSION;

        await this.conversationService.logMessage({
          conversationId: conversation.id,
          messageId,
          direction: MessageDirection.INBOUND,
          fromEmail,
          subject: message.subject,
          bodyText: message.text,
          intent,
          intentConfidence: 0.95,
          attachments,
          processed: true,
        });

        await this.conversationService.updateLastIntent(conversation.id, intent);

        const extractedName = this.claraAi.extractCompanyFromFilename(
          attachments.find((a) => a.isPitchDeck)?.filename,
        );

        const result = await this.submissionService.handleSubmission(
          ctx,
          this.adminUserId,
          extractedName,
        );

        await this.conversationService.linkStartup(conversation.id, result.startupId);
        await this.conversationService.updateStatus(
          conversation.id,
          ConversationStatus.PROCESSING,
        );

        const extra = {
          startupName: result.startupName,
          startupStatus: result.status,
          startupStage: startupContext.startupStage ?? "seed",
        };

        if (result.isDuplicate) {
          replyText = result.isEnriched
            ? `We already have ${result.startupName} in our system. I've updated it with the new pitch deck you sent and re-triggered the analysis. You'll receive an updated report when it's ready.`
            : `We already have ${result.startupName} in our system (status: ${result.status}). I've linked this conversation to the existing record.`;
        } else {
          replyText = await this.claraAi.generateResponse(
            ClaraIntent.SUBMISSION,
            ctx,
            extra,
          );
        }
      } else {
        intent = ClaraIntent.GREETING;

        await this.conversationService.logMessage({
          conversationId: conversation.id,
          messageId,
          direction: MessageDirection.INBOUND,
          fromEmail,
          subject: message.subject,
          bodyText: message.text,
          intent,
          attachments,
          processed: true,
        });

        await this.conversationService.updateLastIntent(conversation.id, intent);

        const tools = this.toolsService.buildTools(ctx.investorUserId);
        replyText = await this.claraAi.runAgentLoop(ctx, tools);
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

      this.logger.log(`Processed message ${messageId}: intent=${intent}`);
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

  private extractEmailAddress(from: string): string {
    const angleMatch = from.match(/<([^>]+)>/);
    if (angleMatch?.[1]) {
      return angleMatch[1].trim().toLowerCase();
    }

    return from.trim().toLowerCase();
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
