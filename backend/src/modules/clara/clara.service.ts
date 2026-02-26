import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { eq } from "drizzle-orm";
import { DrizzleService } from "../../database";
import { user } from "../../auth/entities/auth.schema";
import { startup } from "../startup/entities/startup.schema";
import { ClaraConversationService } from "./clara-conversation.service";
import { ClaraAiService } from "./clara-ai.service";
import { ClaraSubmissionService } from "./clara-submission.service";
import { ClaraToolsService } from "./clara-tools.service";
import { ClaraChannelService } from "./clara-channel.service";
import {
  ClaraIntent,
  ConversationStatus,
  MessageDirection,
  type AttachmentMeta,
  type ClaraAgentRuntimeState,
  type IntentClassification,
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
    private claraChannel: ClaraChannelService,
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
      const message = await this.claraChannel.getEmailMessage(
        inboxId,
        messageId,
      );

      const rawFrom = message.from;
      const fromEmail = this.extractEmailAddress(rawFrom);
      const fromName = this.parseNameFromEmail(rawFrom);
      const senderUser = await this.findUserByEmail(fromEmail);
      const actorUserId = senderUser?.id ?? null;
      const actorRole = senderUser?.role ?? null;
      const investorUserId = actorRole === "investor" ? actorUserId : null;

      const conversation = await this.conversationService.findOrCreate(
        threadId,
        fromEmail,
        fromName,
        investorUserId,
      );

      const isDuplicateInbound =
        typeof (this.conversationService as ClaraConversationService & {
          hasMessage?: (
            conversationId: string,
            messageId: string,
            direction: MessageDirection,
          ) => Promise<boolean>;
        }).hasMessage === "function"
          ? await (this.conversationService as ClaraConversationService & {
              hasMessage: (
                conversationId: string,
                messageId: string,
                direction: MessageDirection,
              ) => Promise<boolean>;
            }).hasMessage(conversation.id, messageId, MessageDirection.INBOUND)
          : false;

      if (isDuplicateInbound) {
        this.logger.warn(
          `Skipping duplicate Clara webhook message ${messageId} for thread ${threadId}`,
        );
        return;
      }

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
        channel: "email",
        threadId,
        messageId,
        inboxId,
        subject: message.subject ?? null,
        bodyText: message.text ?? null,
        fromEmail,
        fromName,
        attachments,
        actorUserId,
        actorRole,
        conversationHistory: history,
        investorUserId,
        startupId: conversation.startupId,
        startupStage: startupContext.startupStage ?? null,
        conversationStatus: conversation.status as ConversationStatus,
        conversationMemory:
          conversation.context && typeof conversation.context === "object"
            ? (conversation.context as Record<string, unknown>)
            : null,
      };

      let replyText: string;
      let intent: ClaraIntent;
      let intentClassification: IntentClassification;
      let finalStartupId: string | null = conversation.startupId;
      let finalStartupExtra = startupContext;
      const agentRuntime: ClaraAgentRuntimeState = {
        replyHandled: false,
        replyText: null,
        replyAttachments: [],
      };

      if (typeof (this.claraAi as ClaraAiService & {
        classifyIntent?: (context: MessageContext) => Promise<IntentClassification>;
      }).classifyIntent === "function") {
        intentClassification = await (this.claraAi as ClaraAiService & {
          classifyIntent: (context: MessageContext) => Promise<IntentClassification>;
        }).classifyIntent(ctx);
      } else {
        const fallbackSubmission = this.claraAi.isLikelySubmission(ctx);
        intentClassification = {
          intent: fallbackSubmission ? ClaraIntent.SUBMISSION : ClaraIntent.GREETING,
          confidence: fallbackSubmission ? 0.95 : 0.4,
          reasoning: "Legacy ClaraAi mock fallback",
        };
      }

      if (
        intentClassification.intent === ClaraIntent.SUBMISSION ||
        this.claraAi.isLikelySubmission(ctx)
      ) {
        intent = ClaraIntent.SUBMISSION;

        await this.conversationService.logMessage({
          conversationId: conversation.id,
          messageId,
          direction: MessageDirection.INBOUND,
          fromEmail,
          subject: message.subject,
          bodyText: message.text,
          intent,
          intentConfidence: intentClassification.confidence,
          attachments,
          processed: true,
        });

        await this.conversationService.updateLastIntent(conversation.id, intent);

        const extractedName = this.claraAi.extractCompanyFromFilename(
          attachments.find((a) => a.isPitchDeck)?.filename,
        ) ?? intentClassification.extractedCompanyName;

        const result = await this.submissionService.handleSubmission(
          ctx,
          this.adminUserId,
          extractedName,
        );

        await this.conversationService.linkStartup(conversation.id, result.startupId);
        finalStartupId = result.startupId;
        await this.conversationService.updateStatus(
          conversation.id,
          ConversationStatus.PROCESSING,
        );

        const extra = {
          startupName: result.startupName,
          startupStatus: result.status,
          startupStage: startupContext.startupStage ?? "seed",
        };
        finalStartupExtra = {
          ...startupContext,
          ...extra,
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
        intent = intentClassification.intent;

        await this.conversationService.logMessage({
          conversationId: conversation.id,
          messageId,
          direction: MessageDirection.INBOUND,
          fromEmail,
          subject: message.subject,
          bodyText: message.text,
          intent,
          intentConfidence: intentClassification.confidence,
          attachments,
          processed: true,
        });

        await this.conversationService.updateLastIntent(conversation.id, intent);

        const tools = this.toolsService.buildTools({
          actorUserId,
          actorRole,
          linkedStartupId: conversation.startupId,
          channel: "email",
          inboxId: ctx.inboxId,
          inReplyToMessageId: ctx.messageId,
          runtime: agentRuntime,
        });
        replyText = await this.claraAi.runAgentLoop(ctx, tools, {
          actorRole,
          conversationMemory: ctx.conversationMemory,
        });
      }

      if (!agentRuntime.replyHandled) {
        await this.claraChannel.reply({
          channel: "email",
          email: {
            inboxId,
            inReplyToMessageId: messageId,
          },
          text: replyText,
        });
      }

      const outboundText = agentRuntime.replyHandled
        ? (agentRuntime.replyText ?? replyText)
        : replyText;

      await this.conversationService.logMessage({
        conversationId: conversation.id,
        messageId: `reply-${messageId}`,
        direction: MessageDirection.OUTBOUND,
        fromEmail: `clara@agentmail.to`,
        bodyText: outboundText,
        attachments:
          agentRuntime.replyHandled && agentRuntime.replyAttachments.length > 0
            ? agentRuntime.replyAttachments.map((a, index) => ({
                filename: a.filename,
                contentType: a.contentType,
                attachmentId: `generated-${index}`,
                isPitchDeck: false,
                status: "uploaded" as const,
              }))
            : null,
        processed: true,
      });

      if (typeof this.conversationService.updateContext === "function") {
        await this.conversationService.updateContext(
          conversation.id,
          this.mergeConversationContext(
            conversation.context as Record<string, unknown> | null | undefined,
            this.buildConversationMemoryPatch({
              ctx,
              intent,
              intentClassification,
              replyText: outboundText,
              startupId: finalStartupId,
              startupExtra: finalStartupExtra,
              attachmentReply: agentRuntime.replyAttachments,
            }),
          ),
        );
      }

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

    await this.claraChannel.send({
      channel: "email",
      email: {
        inboxId: this.claraInboxId,
        to: [conversation.investorEmail],
        subject: `Analysis Complete: ${startupRecord.name}`,
      },
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

  private async findUserByEmail(
    email: string,
  ): Promise<{ id: string; role: string } | null> {
    const [sender] = await this.drizzle.db
      .select({ id: user.id, role: user.role })
      .from(user)
      .where(eq(user.email, email))
      .limit(1);

    if (sender) return { id: sender.id, role: sender.role };
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

  private mergeConversationContext(
    existing: Record<string, unknown> | null | undefined,
    patch: Record<string, unknown>,
  ): Record<string, unknown> {
    const base =
      existing && typeof existing === "object" && !Array.isArray(existing)
        ? existing
        : {};
    return {
      ...base,
      ...patch,
      memoryUpdatedAt: new Date().toISOString(),
    };
  }

  private buildConversationMemoryPatch(params: {
    ctx: MessageContext;
    intent: ClaraIntent;
    intentClassification: IntentClassification;
    replyText: string;
    startupId: string | null;
    startupExtra: {
      startupName?: string;
      startupStatus?: string;
      score?: number;
      startupStage?: string;
    };
    attachmentReply: Array<{ filename: string; contentType: string }>;
  }): Record<string, unknown> {
    const { ctx, intent, intentClassification, replyText, startupId, startupExtra, attachmentReply } = params;

    const bodyPreview = (ctx.bodyText ?? "").trim().slice(0, 300);
    const replyPreview = (replyText ?? "").trim().slice(0, 300);
    const previousTopics = Array.isArray(ctx.conversationMemory?.["recentTopics"])
      ? (ctx.conversationMemory?.["recentTopics"] as unknown[])
          .filter((v): v is string => typeof v === "string")
      : [];
    const topicCandidates = [
      intent,
      startupExtra.startupStatus ? `startup-status:${startupExtra.startupStatus}` : null,
      attachmentReply.length > 0 ? `attachment:${attachmentReply[0]?.filename ?? "pdf"}` : null,
    ].filter((v): v is string => Boolean(v));
    const recentTopics = Array.from(new Set([...previousTopics, ...topicCandidates])).slice(-8);

    return {
      lastIntent: intent,
      lastIntentConfidence: intentClassification.confidence,
      lastIntentReasoning: intentClassification.reasoning,
      lastInboundSubject: ctx.subject,
      lastInboundPreview: bodyPreview,
      lastReplyPreview: replyPreview,
      lastSenderEmail: ctx.fromEmail,
      lastSenderName: ctx.fromName,
      actorRole: ctx.actorRole ?? null,
      linkedStartupId: startupId,
      linkedStartupName: startupExtra.startupName ?? null,
      linkedStartupStatus: startupExtra.startupStatus ?? null,
      linkedStartupScore:
        typeof startupExtra.score === "number" ? startupExtra.score : null,
      attachmentReplyHistory: attachmentReply,
      recentTopics,
    };
  }
}
