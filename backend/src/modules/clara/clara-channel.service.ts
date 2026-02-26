import { Injectable, NotImplementedException } from "@nestjs/common";
import type { AgentMail } from "agentmail";
import { AgentMailClientService } from "../integrations/agentmail/agentmail-client.service";

export type ClaraChannelKind = "email" | "whatsapp" | "other";

type EmailReplyTarget = {
  inboxId: string;
  inReplyToMessageId: string;
};

type EmailSendTarget = {
  inboxId: string;
  to: string[];
  subject?: string;
};

@Injectable()
export class ClaraChannelService {
  constructor(private agentMailClient: AgentMailClientService) {}

  async getEmailMessage(inboxId: string, messageId: string) {
    return this.agentMailClient.getMessage(inboxId, messageId);
  }

  async reply(params: {
    channel: ClaraChannelKind;
    text?: string;
    html?: string;
    attachments?: AgentMail.SendAttachment[];
    email?: EmailReplyTarget;
  }) {
    if (params.channel !== "email") {
      throw new NotImplementedException(
        `Clara channel adapter for ${params.channel} is not implemented yet`,
      );
    }

    if (!params.email) {
      throw new Error("Email reply target is required for email channel replies");
    }

    return this.agentMailClient.replyToMessage(
      params.email.inboxId,
      params.email.inReplyToMessageId,
      {
        text: params.text,
        html: params.html,
        attachments: params.attachments,
      },
    );
  }

  async send(params: {
    channel: ClaraChannelKind;
    text?: string;
    html?: string;
    attachments?: AgentMail.SendAttachment[];
    email?: EmailSendTarget;
  }) {
    if (params.channel !== "email") {
      throw new NotImplementedException(
        `Clara channel adapter for ${params.channel} is not implemented yet`,
      );
    }

    if (!params.email) {
      throw new Error("Email send target is required for email channel sends");
    }

    return this.agentMailClient.sendMessage(params.email.inboxId, {
      to: params.email.to,
      subject: params.email.subject,
      text: params.text,
      html: params.html,
      attachments: params.attachments,
    });
  }
}
