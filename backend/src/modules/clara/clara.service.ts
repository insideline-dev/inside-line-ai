import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { eq } from "drizzle-orm";
import type { AgentMail } from "agentmail";
import { DrizzleService } from "../../database";
import { user } from "../../auth/entities/auth.schema";
import { startup, StartupStage } from "../startup/entities/startup.schema";
import { PdfService } from "../startup/pdf.service";
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
  private readonly inboundMessageLocks = new Set<string>();

  constructor(
    private config: ConfigService,
    private drizzle: DrizzleService,
    private claraChannel: ClaraChannelService,
    private conversationService: ClaraConversationService,
    private claraAi: ClaraAiService,
    private submissionService: ClaraSubmissionService,
    private toolsService: ClaraToolsService,
    private pdfService: PdfService,
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
    if (!this.claraInboxId) {
      return false;
    }

    const configured = this.normalizeInboxId(this.claraInboxId);
    const incoming = this.normalizeInboxId(inboxId);
    return configured.length > 0 && configured === incoming;
  }

  private normalizeInboxId(value: string | null | undefined): string {
    if (!value) {
      return "";
    }

    return value
      .trim()
      .toLowerCase()
      .replace(/:[a-z0-9_-]+$/i, "");
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

    const lockKey = `${this.normalizeInboxId(inboxId)}:${threadId}:${messageId || "(empty)"}`;
    if (this.inboundMessageLocks.has(lockKey)) {
      this.logger.warn(
        `[Clara] Skipping concurrent duplicate webhook processing for thread ${threadId}, message ${messageId || "(empty)"}`,
      );
      return;
    }
    this.inboundMessageLocks.add(lockKey);

    try {
      const message = await this.claraChannel.getEmailMessage(
        inboxId,
        messageId,
      );

      const rawFrom = message.from;
      const fromEmail = this.extractEmailAddress(rawFrom);
      if (this.isClaraOriginatedMessage(fromEmail)) {
        this.logger.debug(
          `[Clara] Ignoring self-originated webhook message ${messageId} on thread ${threadId} from ${fromEmail}`,
        );
        return;
      }

      const hasPitchDeckAttachment = (message.attachments ?? []).some(
        (attachment) =>
          this.isPitchDeckAttachment(attachment.filename, attachment.contentType),
      );
      const fromName = this.parseNameFromEmail(rawFrom);
      const senderUser = await this.findUserByEmail(fromEmail);
      const actorUserId = senderUser?.id ?? null;
      const actorRole = senderUser?.role ?? null;
      const investorUserId = actorRole === "investor" ? actorUserId : null;

      let conversation = await this.conversationService.findOrCreate(
        threadId,
        fromEmail,
        fromName,
        investorUserId,
      );

      if (!conversation.startupId && !hasPitchDeckAttachment) {
        const awaitingInfoConversation =
          await this.conversationService.findLatestAwaitingInfoByInvestorEmail(
            fromEmail,
            conversation.id,
          );
        let linkCandidate = awaitingInfoConversation;

        if (!linkCandidate) {
          const latestLinkedConversation =
            await this.conversationService.findLatestByInvestorEmailWithStartup(
              fromEmail,
              conversation.id,
            );
          if (latestLinkedConversation?.startupId) {
            const stillMissingCriticalFields =
              await this.submissionService.hasMissingCriticalFields(
                latestLinkedConversation.startupId,
              );
            if (stillMissingCriticalFields) {
              linkCandidate = latestLinkedConversation;
            }
          }
        }

        if (linkCandidate?.startupId) {
          await this.conversationService.linkStartup(
            conversation.id,
            linkCandidate.startupId,
          );
          await this.conversationService.updateStatus(
            conversation.id,
            ConversationStatus.AWAITING_INFO,
          );
          conversation = {
            ...conversation,
            startupId: linkCandidate.startupId,
            status: ConversationStatus.AWAITING_INFO,
          };
          this.logger.warn(
            `[Clara] Linked detached thread ${threadId} to startup ${linkCandidate.startupId} via conversation ${linkCandidate.id} for missing-info resolution`,
          );
        }
      } else if (!conversation.startupId && hasPitchDeckAttachment) {
        this.logger.debug(
          `[Clara] Skipping detached-thread relink for thread ${threadId}: pitch deck attachment indicates fresh submission intent`,
        );
      }

      const alreadyRepliedToMessage =
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
            }).hasMessage(
              conversation.id,
              `reply-${messageId}`,
              MessageDirection.OUTBOUND,
            )
          : false;

      if (alreadyRepliedToMessage) {
        this.logger.warn(
          `Skipping duplicate Clara webhook message ${messageId} for thread ${threadId}`,
        );
        return;
      }

      const alreadyProcessedInbound =
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
            }).hasMessage(
              conversation.id,
              messageId,
              MessageDirection.INBOUND,
            )
          : false;
      if (alreadyProcessedInbound) {
        this.logger.warn(
          `Skipping duplicate inbound Clara webhook message ${messageId} for thread ${threadId}`,
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
          isPitchDeck: this.isPitchDeckAttachment(a.filename, a.contentType),
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

      let replyText = "Thanks for the update.";
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
      const unresolvedCriticalFields = conversation.startupId
        ? await this.submissionService.getMissingCriticalFieldsForStartup(
            conversation.startupId,
          )
        : [];
      const shouldResolveMissingInfo =
        Boolean(conversation.startupId) &&
        (conversation.status === ConversationStatus.AWAITING_INFO ||
          unresolvedCriticalFields.length > 0);
      const hasSubmissionAttachment = attachments.some((attachment) =>
        Boolean(attachment.isPitchDeck),
      );

      const isSubmissionIntent =
        hasSubmissionAttachment ||
        intentClassification.intent === ClaraIntent.SUBMISSION ||
        this.claraAi.isLikelySubmission(ctx);
      const shouldPreferMissingInfoResolution =
        shouldResolveMissingInfo &&
        Boolean(conversation.startupId) &&
        !hasSubmissionAttachment;
      const submissionAllowedByContext =
        !conversation.startupId || hasSubmissionAttachment;
      const shouldProcessAsSubmission =
        isSubmissionIntent &&
        submissionAllowedByContext &&
        !shouldPreferMissingInfoResolution;

      this.logger.debug(
        `[Clara] Intent routing for thread ${threadId}: intent=${intentClassification.intent} submissionIntent=${isSubmissionIntent} hasDeckAttachment=${hasSubmissionAttachment} shouldResolveMissing=${shouldResolveMissingInfo} startupLinked=${Boolean(conversation.startupId)} route=${shouldProcessAsSubmission ? "submission" : "missing-info/follow-up"}`,
      );

      if (shouldProcessAsSubmission) {
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

        const extractedName = intentClassification.extractedCompanyName;

        const result = await this.submissionService.handleSubmission(
          ctx,
          this.adminUserId,
          extractedName,
        );
        if (result.noPitchDeck) {
          this.logger.warn(
            `[Clara] No pitch deck detected for thread ${threadId} — requesting resend from ${fromEmail}`,
          );
          await this.conversationService.updateStatus(
            conversation.id,
            ConversationStatus.AWAITING_INFO,
          );
          replyText = [
            `Hi ${fromName ?? "there"},`,
            "",
            "Thanks for reaching out! I received your email but wasn't able to identify a pitch deck among the attached files.",
            "",
            "Please resend with your pitch deck (PDF or PowerPoint presentation) and I'll get the analysis started right away.",
            "",
            "Best regards,",
            "Clara",
          ].join("\n");
        } else {
        this.logger.log(
          `[Clara] Submission handling for thread ${threadId} -> startup=${result.startupId} duplicate=${result.isDuplicate} enriched=${Boolean(result.isEnriched)} pipelineStarted=${Boolean(result.pipelineStarted)} missing=${(result.missingFields ?? []).join(",") || "none"}`,
        );

        await this.conversationService.linkStartup(conversation.id, result.startupId);
        finalStartupId = result.startupId;

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
          if (
            result.pipelineStarted === false &&
            (result.missingFields?.length ?? 0) > 0
          ) {
            const missingLabels = this.formatMissingFieldLabels(
              result.missingFields ?? [],
            );
            replyText = [
              `We already have ${result.startupName} in our system and I’ve updated it with the details you sent.`,
              "",
              "Before I can restart analysis, I still need:",
              ...missingLabels.map((label) => `- ${label}`),
              "",
              "Please reply with the missing details and I’ll start the pipeline immediately.",
            ].join("\n");
            await this.conversationService.updateStatus(
              conversation.id,
              ConversationStatus.AWAITING_INFO,
            );
          } else if (result.pipelineStarted) {
            await this.conversationService.updateStatus(
              conversation.id,
              ConversationStatus.PROCESSING,
            );
            replyText = result.isEnriched
              ? `We already have ${result.startupName} in our system. I've updated it with the new information you sent and re-triggered the analysis. You'll receive an updated report when it's ready.`
              : `We already have ${result.startupName} in our system (status: ${result.status}). I've linked this conversation to the existing record and started the analysis pipeline.`;
          } else {
            replyText = result.isEnriched
              ? `We already have ${result.startupName} in our system. I've updated it with the new information you sent and re-triggered the analysis. You'll receive an updated report when it's ready.`
              : `We already have ${result.startupName} in our system (status: ${result.status}). I've linked this conversation to the existing record.`;
          }
        } else {
          if (result.pipelineStarted === false) {
            const missingLabels = this.formatMissingFieldLabels(
              result.missingFields ?? [],
            );
            replyText = [
              `Subject: Pitch Deck Received: ${result.startupName}`,
              "",
              `Hi ${fromName ?? "there"},`,
              "",
              "Thanks, I received your pitch deck.",
              "I still need the following details before I can start the analysis:",
              ...missingLabels.map((label) => `- ${label}`),
              "",
              "Please reply with those details and I’ll start the pipeline right away.",
              "",
              "Best regards,",
              "Clara",
            ].join("\n");
            await this.conversationService.updateStatus(
              conversation.id,
              ConversationStatus.AWAITING_INFO,
            );
          } else {
            await this.conversationService.updateStatus(
              conversation.id,
              ConversationStatus.PROCESSING,
            );
            replyText = await this.claraAi.generateResponse(
              ClaraIntent.SUBMISSION,
              ctx,
              extra,
            );
          }
        }
        } // end else (noPitchDeck check)
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

        if (shouldResolveMissingInfo && conversation.startupId) {
          const replyContent = [ctx.subject, ctx.bodyText]
            .filter((value): value is string => Boolean(value && value.trim()))
            .join("\n\n");
          const resolution = await this.submissionService.resolveMissingInfoFromReply(
            conversation.startupId,
            replyContent || null,
            investorUserId ?? this.adminUserId,
          );
          if (resolution) {
            if (conversation.startupId !== resolution.startupId) {
              await this.conversationService.linkStartup(
                conversation.id,
                resolution.startupId,
              );
            }
            finalStartupId = resolution.startupId;
            finalStartupExtra = {
              ...finalStartupExtra,
              startupName: resolution.startupName,
            };
            this.logger.log(
              `[Clara] Missing-info reply for thread ${threadId} -> startup=${resolution.startupId} updated=${resolution.updatedFields.join(",") || "none"} remaining=${resolution.remainingMissing.join(",") || "none"} pipelineStarted=${resolution.pipelineStarted}`,
            );
          }

          if (resolution) {
            const missingLabels = this.formatMissingFieldLabels(
              resolution.remainingMissing,
            );
            if (resolution.pipelineStarted) {
              replyText = [
                `Thanks ${fromName ?? "there"} — I’ve updated ${resolution.startupName} with the missing details and restarted the analysis.`,
                "",
                "I’ll email you again as soon as the analysis is complete.",
              ].join("\n");
              await this.conversationService.updateStatus(
                conversation.id,
                ConversationStatus.PROCESSING,
              );
            } else {
              const acknowledgement =
                resolution.updatedFields.length > 0
                  ? `Thanks — I captured ${resolution.updatedFields
                      .map((field) =>
                        field === "website" ? "the website" : "the funding stage",
                      )
                      .join(" and ")}.`
                  : "Thanks for the follow-up.";
              replyText = [
                acknowledgement,
                "",
                "I still need:",
                ...missingLabels.map((label) => `- ${label}`),
                "",
                "Reply with the missing details and I’ll start the analysis immediately.",
              ].join("\n");
              await this.conversationService.updateStatus(
                conversation.id,
                ConversationStatus.AWAITING_INFO,
              );
            }
          } else {
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
        } else {
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
    } finally {
      this.inboundMessageLocks.delete(lockKey);
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

    const pdfAttachments = await this.buildCompletionPdfAttachments(
      startupId,
      startupRecord.name,
      conversation.investorUserId ?? null,
    );

    const attachedDocsText =
      pdfAttachments.length > 0
        ? "I've attached both the investment memo and the full analysis report as PDFs for your review."
        : "The analysis is complete. I wasn't able to attach the PDFs in this email, but you can download the memo and report from the platform.";

    const replyText = [
      `Hi ${conversation.investorName ?? "there"},`,
      "",
      `Great news! The analysis for ${startupRecord.name} is complete${scoreText}.`,
      "",
      "Our AI has evaluated the startup across multiple dimensions including team, market opportunity, product, traction, financials, competitive advantage, and more.",
      "",
      attachedDocsText,
      "You can also reply to this email to ask follow-up questions about the analysis.",
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
      attachments: pdfAttachments.length > 0 ? pdfAttachments : undefined,
    });

    this.logger.log(
      `Pipeline completion email sent for startup ${startupId} to ${conversation.investorEmail} (attachments=${pdfAttachments.length})`,
    );

    await this.conversationService.logMessage({
      conversationId: conversation.id,
      messageId: `pipeline-complete-${startupId}`,
      direction: MessageDirection.OUTBOUND,
      fromEmail: `clara@agentmail.to`,
      subject: `Analysis Complete: ${startupRecord.name}`,
      bodyText: replyText,
      attachments:
        pdfAttachments.length > 0
          ? pdfAttachments.map((att, index) => ({
              filename: att.filename ?? `attachment-${index}.pdf`,
              contentType: att.contentType ?? "application/pdf",
              attachmentId: `pipeline-complete-${startupId}-${index}`,
              isPitchDeck: false,
              status: "uploaded" as const,
            }))
          : null,
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

  async notifyMissingStartupInfo(
    startupId: string,
    missingFields: string[],
    options?: {
      pipelineRunId?: string | null;
    },
  ): Promise<void> {
    if (!this.claraInboxId) return;

    const normalizedMissing = this.normalizeMissingStartupFields(missingFields);
    if (normalizedMissing.length === 0) return;

    const [startupRecord] = await this.drizzle.db
      .select({
        id: startup.id,
        userId: startup.userId,
        name: startup.name,
        website: startup.website,
        stage: startup.stage,
        industry: startup.industry,
        location: startup.location,
        fundingTarget: startup.fundingTarget,
        teamSize: startup.teamSize,
        contactEmail: startup.contactEmail,
        contactName: startup.contactName,
      })
      .from(startup)
      .where(eq(startup.id, startupId))
      .limit(1);
    if (!startupRecord) return;

    const unresolvedMissing = normalizedMissing.filter((field) =>
      this.isStartupFieldMissing(field, startupRecord),
    );
    if (unresolvedMissing.length === 0) return;

    const recipient = await this.resolveMissingInfoRecipient({
      userId: startupRecord.userId,
      contactEmail: startupRecord.contactEmail,
      contactName: startupRecord.contactName,
    });
    if (!recipient) {
      this.logger.warn(
        `Unable to send Clara missing-info request for startup ${startupId}: no valid recipient`,
      );
      return;
    }

    const conversation = await this.conversationService.findByStartupId(startupId);
    const dedupeScope =
      options?.pipelineRunId?.trim() || `adhoc-${new Date().toISOString().slice(0, 10)}`;
    const messageId = `missing-info-${startupId}-${dedupeScope}-${unresolvedMissing.join("-")}`;
    if (conversation) {
      const alreadySent = await this.conversationService.hasMessage(
        conversation.id,
        messageId,
        MessageDirection.OUTBOUND,
      );
      if (alreadySent) {
        this.logger.debug(
          `Skipping duplicate Clara missing-info request for startup ${startupId} (scope=${dedupeScope}, fields=${unresolvedMissing.join(",")})`,
        );
        return;
      }
    }

    const labels = unresolvedMissing.map((field) =>
      field === "website"
        ? "Company website URL"
        : "Current funding stage (pre-seed, seed, series A, etc.)",
    );
    const greetingName = recipient.name ?? "there";
    const replyText = [
      `Hi ${greetingName},`,
      "",
      `I'm finalizing the startup profile for ${startupRecord.name}, but I still need the following information:`,
      ...labels.map((label) => `- ${label}`),
      "",
      "Please reply with the missing details so we can complete the analysis accurately.",
      "",
      "Best,",
      "Clara",
    ].join("\n");

    await this.claraChannel.send({
      channel: "email",
      email: {
        inboxId: this.claraInboxId,
        to: [recipient.email],
        subject: `Action Needed: Missing startup details for ${startupRecord.name}`,
      },
      text: replyText,
    });

    this.logger.log(
      `Sent Clara missing-info request for startup ${startupId} to ${recipient.email} (fields=${unresolvedMissing.join(",")}, scope=${dedupeScope})`,
    );

    if (conversation) {
      await this.conversationService.logMessage({
        conversationId: conversation.id,
        messageId,
        direction: MessageDirection.OUTBOUND,
        fromEmail: "clara@agentmail.to",
        subject: `Action Needed: Missing startup details for ${startupRecord.name}`,
        bodyText: replyText,
        processed: true,
      });
      await this.conversationService.updateStatus(
        conversation.id,
        ConversationStatus.AWAITING_INFO,
      );
    }
  }

  private normalizeMissingStartupFields(
    fields: string[],
  ): Array<"website" | "stage"> {
    return Array.from(
      new Set(
        fields
          .map((field) => field.trim().toLowerCase())
          .filter(
            (field): field is "website" | "stage" =>
              field === "website" || field === "stage",
          ),
      ),
    );
  }

  private formatMissingFieldLabels(
    fields: Array<"website" | "stage">,
  ): string[] {
    const normalized = this.normalizeMissingStartupFields(fields);
    return normalized.map((field) =>
      field === "website"
        ? "Company website URL"
        : "Current funding stage (pre-seed, seed, series A, etc.)",
    );
  }

  private async resolveMissingInfoRecipient(params: {
    userId: string;
    contactEmail: string | null;
    contactName: string | null;
  }): Promise<{ email: string; name: string | null } | null> {
    const contactEmail = params.contactEmail?.trim().toLowerCase() ?? null;
    if (contactEmail && this.isValidEmail(contactEmail)) {
      const displayName =
        params.contactName?.trim() ||
        this.parseNameFromEmail(contactEmail);
      return {
        email: contactEmail,
        name: displayName ?? null,
      };
    }

    const [owner] = await this.drizzle.db
      .select({
        email: user.email,
        name: user.name,
      })
      .from(user)
      .where(eq(user.id, params.userId))
      .limit(1);
    if (!owner?.email) {
      return null;
    }

    const ownerEmail = owner.email.trim().toLowerCase();
    if (!this.isValidEmail(ownerEmail)) {
      return null;
    }

    return {
      email: ownerEmail,
      name: owner.name ?? null,
    };
  }

  private isValidEmail(value: string): boolean {
    return /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(value);
  }

  private isStartupFieldMissing(
    field: "website" | "stage",
    startupRecord: {
      website: string;
      stage: string;
      industry: string;
      location: string;
      fundingTarget: number;
      teamSize: number;
    },
  ): boolean {
    if (field === "website") {
      return this.isMissingWebsiteValue(startupRecord.website);
    }
    return this.isLikelyPlaceholderStage(startupRecord);
  }

  private isMissingWebsiteValue(value: string | null | undefined): boolean {
    if (!value) return true;
    try {
      const host = new URL(value).hostname.toLowerCase().replace(/^www\./, "");
      return host === "pending-extraction.com";
    } catch {
      return true;
    }
  }

  private isLikelyPlaceholderStage(startupRecord: {
    website: string;
    stage: string;
    industry: string;
    location: string;
    fundingTarget: number;
    teamSize: number;
  }): boolean {
    const normalizedStage = this.mapStageToEnum(startupRecord.stage);
    if (!normalizedStage) {
      return true;
    }
    if (normalizedStage !== StartupStage.SEED) {
      return false;
    }

    const structuralSignals = [
      this.isMissingWebsiteValue(startupRecord.website),
      this.isLikelyPlaceholderText(startupRecord.industry),
      this.isLikelyPlaceholderText(startupRecord.location),
    ];
    const secondarySignals = [
      startupRecord.fundingTarget <= 0,
      startupRecord.teamSize <= 1,
    ];
    const totalSignals = [...structuralSignals, ...secondarySignals];
    return (
      structuralSignals.filter(Boolean).length >= 1 &&
      totalSignals.filter(Boolean).length >= 2
    );
  }

  private isLikelyPlaceholderText(value: string | null | undefined): boolean {
    if (!value) {
      return true;
    }
    const normalized = value.trim().toLowerCase();
    if (!normalized) {
      return true;
    }
    return (
      normalized.includes("pending extraction") ||
      normalized.includes("pending-extraction") ||
      normalized === "unknown" ||
      normalized === "n/a"
    );
  }

  private mapStageToEnum(value: string | null | undefined): StartupStage | null {
    if (!value) {
      return null;
    }

    const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, "_");
    const mapping: Record<string, StartupStage> = {
      pre_seed: StartupStage.PRE_SEED,
      preseed: StartupStage.PRE_SEED,
      seed: StartupStage.SEED,
      series_a: StartupStage.SERIES_A,
      series_b: StartupStage.SERIES_B,
      series_c: StartupStage.SERIES_C,
      series_d: StartupStage.SERIES_D,
      series_e: StartupStage.SERIES_E,
      series_f: StartupStage.SERIES_F_PLUS,
      series_f_plus: StartupStage.SERIES_F_PLUS,
      "series_f+": StartupStage.SERIES_F_PLUS,
    };
    return mapping[normalized] ?? null;
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

  private isPitchDeckAttachment(
    filename: string | null | undefined,
    contentType: string | null | undefined,
  ): boolean {
    const normalizedType = (contentType ?? "").toLowerCase();
    const normalizedName = (filename ?? "").toLowerCase();
    if (/deck|pitch|teaser|presentation|slides?/.test(normalizedName)) {
      return true;
    }
    if (
      normalizedType.includes("presentation") ||
      normalizedType.includes("powerpoint")
    ) {
      return true;
    }
    if (normalizedType === "application/pdf") {
      return !this.isLikelySupportingDocumentAttachment(normalizedName);
    }

    return false;
  }

  private isLikelySupportingDocumentAttachment(filename: string): boolean {
    return /\b(financials?|cap[\s_-]?table|statement|balance[\s_-]?sheet|cash[\s_-]?flow|p&l|profit[\s_-]?and[\s_-]?loss|budget|forecast|model|invoice|contract|nda|tax|compliance|report|annual|quarterly|earnings?|supplemental|shareholder|10[\s_-]?[kq]|sec[\s_-]?filing|filing)\b/i.test(
      filename,
    );
  }

  private isClaraOriginatedMessage(fromEmail: string): boolean {
    const normalized = fromEmail.trim().toLowerCase();
    if (!normalized) {
      return false;
    }

    const configuredInbox = (this.claraInboxId ?? "").trim().toLowerCase();
    if (configuredInbox.includes("@") && normalized === configuredInbox) {
      return true;
    }

    const aliasPatterns = [
      "clara@agentmail.to",
      "clara@insideline.ai",
    ];
    if (aliasPatterns.includes(normalized)) {
      return true;
    }

    if (normalized.endsWith("@agentmail.to")) {
      const localPart = normalized.split("@")[0] ?? "";
      if (localPart.startsWith("clara")) {
        return true;
      }
    }

    return false;
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

  private async buildCompletionPdfAttachments(
    startupId: string,
    startupName: string,
    preferredAccessorUserId: string | null,
  ): Promise<AgentMail.SendAttachment[]> {
    const safeName = startupName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "startup";

    const accessorCandidates = Array.from(
      new Set(
        [preferredAccessorUserId, this.adminUserId].filter(
          (value): value is string => Boolean(value),
        ),
      ),
    );

    if (accessorCandidates.length === 0) {
      this.logger.warn(
        `No accessor user available to generate completion PDFs for startup ${startupId}`,
      );
      return [];
    }

    let lastError: unknown = null;

    for (const accessorUserId of accessorCandidates) {
      for (let attempt = 1; attempt <= 3; attempt += 1) {
        try {
          const [memoBuffer, reportBuffer] = await Promise.all([
            this.pdfService.generateMemo(startupId, accessorUserId),
            this.pdfService.generateReport(startupId, accessorUserId),
          ]);

          return [
            {
              filename: `${safeName}-memo.pdf`,
              contentType: "application/pdf",
              content: memoBuffer.toString("base64"),
            },
            {
              filename: `${safeName}-report.pdf`,
              contentType: "application/pdf",
              content: reportBuffer.toString("base64"),
            },
          ];
        } catch (error) {
          lastError = error;
          this.logger.warn(
            `Failed to generate completion PDF attachments for startup ${startupId} using accessor ${accessorUserId} (attempt ${attempt}/3): ${error instanceof Error ? error.message : String(error)}`,
          );
          if (attempt < 3) {
            await new Promise((resolve) => setTimeout(resolve, 1500));
          }
        }
      }
    }

    this.logger.warn(
      `Giving up on completion PDF attachments for startup ${startupId} after ${accessorCandidates.length} accessor attempt(s): ${lastError instanceof Error ? lastError.message : String(lastError)}`,
    );
    return [];
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
