import {
  Inject,
  Injectable,
  NotImplementedException,
  forwardRef,
} from "@nestjs/common";
import type { AgentMail } from "agentmail";
import { AgentMailClientService } from "../integrations/agentmail/agentmail-client.service";
import { EvolutionApiClientService } from "../integrations/evolution/evolution-api-client.service";

export type ClaraChannelKind = "email" | "whatsapp" | "other";

type EmailReplyTarget = {
  inboxId: string;
  inReplyToMessageId: string;
};

type EmailSendTarget = {
  inboxId: string;
  to: string[];
  subject: string;
};

type WhatsAppTarget = {
  to: string;
};

@Injectable()
export class ClaraChannelService {
  constructor(
    private readonly agentMailClient: AgentMailClientService,
    @Inject(forwardRef(() => EvolutionApiClientService))
    private readonly evolutionClient: EvolutionApiClientService,
  ) {}

  async getEmailMessage(inboxId: string, messageId: string) {
    return this.agentMailClient.getMessage(inboxId, messageId);
  }

  async reply(params: {
    channel: ClaraChannelKind;
    text?: string;
    html?: string;
    attachments?: AgentMail.SendAttachment[];
    email?: EmailReplyTarget;
    whatsapp?: WhatsAppTarget;
  }) {
    if (params.channel === "email") {
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

    if (params.channel === "whatsapp") {
      if (!params.whatsapp) {
        throw new Error("WhatsApp target is required for WhatsApp replies");
      }
      return this.sendWhatsAppContent({
        to: params.whatsapp.to,
        text: params.text,
        attachments: params.attachments,
      });
    }

    throw new NotImplementedException(
      `Clara channel adapter for ${params.channel} is not implemented yet`,
    );
  }

  async send(params: {
    channel: ClaraChannelKind;
    text?: string;
    html?: string;
    attachments?: AgentMail.SendAttachment[];
    email?: EmailSendTarget;
    whatsapp?: WhatsAppTarget;
  }) {
    if (params.channel === "email") {
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

    if (params.channel === "whatsapp") {
      if (!params.whatsapp) {
        throw new Error("WhatsApp target is required for WhatsApp sends");
      }
      return this.sendWhatsAppContent({
        to: params.whatsapp.to,
        text: params.text,
        attachments: params.attachments,
      });
    }

    throw new NotImplementedException(
      `Clara channel adapter for ${params.channel} is not implemented yet`,
    );
  }

  private async sendWhatsAppContent(params: {
    to: string;
    text?: string;
    attachments?: AgentMail.SendAttachment[];
  }) {
    const attachments = params.attachments ?? [];
    if (attachments.length === 0) {
      if (!params.text?.trim()) {
        throw new Error("Text is required for WhatsApp sends without attachments");
      }
      return this.evolutionClient.sendText({
        to: params.to,
        text: params.text,
      });
    }

    const results = [];
    for (const attachment of attachments) {
      const base64 = attachment.content?.trim();
      if (!base64) continue;
      if (attachment.contentType?.startsWith("audio/")) {
        results.push(
          await this.evolutionClient.sendAudio({
            to: params.to,
            audio: base64,
          }),
        );
      } else {
        results.push(
          await this.evolutionClient.sendMedia({
            to: params.to,
            media: base64,
            fileName: attachment.filename ?? "attachment",
            mimeType: attachment.contentType ?? "application/octet-stream",
            caption: params.text,
          }),
        );
      }
    }

    if (results.length === 0 && params.text?.trim()) {
      return this.evolutionClient.sendText({ to: params.to, text: params.text });
    }

    return results.at(-1) ?? null;
  }
}
