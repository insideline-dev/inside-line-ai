import { Injectable, Logger } from "@nestjs/common";
import { ClaraService } from "../../clara/clara.service";
import { EvolutionContactResolverService } from "./evolution-contact-resolver.service";
import { EvolutionMediaService } from "./evolution-media.service";
import { normalizeWhatsAppPhone } from "./evolution-phone.util";
import type { EvolutionInboundMessage } from "./evolution.types";

@Injectable()
export class EvolutionService {
  private readonly logger = new Logger(EvolutionService.name);

  constructor(
    private readonly clara: ClaraService,
    private readonly contacts: EvolutionContactResolverService,
    private readonly media: EvolutionMediaService,
  ) {}

  async handleWebhook(payload: EvolutionInboundMessage): Promise<{ processed: boolean; reason?: string }> {
    if (!this.isMessagesUpsertEvent(payload.event)) {
      return { processed: false, reason: "unsupported_event" };
    }

    const data = payload.data;
    if (!data?.key?.id || !data.key.remoteJid) {
      return { processed: false, reason: "missing_message_key" };
    }

    if (data.key.fromMe) {
      return { processed: false, reason: "from_me" };
    }

    if (data.key.remoteJid.includes("@g.us")) {
      return { processed: false, reason: "group_message" };
    }

    const phone = normalizeWhatsAppPhone(data.key.remoteJid);
    if (!phone) {
      return { processed: false, reason: "invalid_phone" };
    }

    const contact = await this.contacts.resolveByPhone(phone);
    if (!contact) {
      this.logger.warn(`Ignoring WhatsApp message from unknown number ${phone}`);
      return { processed: false, reason: "unknown_contact" };
    }

    const { attachments, transcriptText } = await this.media.extractInboundMedia(
      payload,
      contact.userId ?? contact.startupId ?? "system",
    );
    const text = this.extractText(data.message ?? {});
    const bodyText = [text, transcriptText]
      .filter((value): value is string => Boolean(value && value.trim()))
      .join("\n\n")
      .trim();

    if (!bodyText && attachments.length === 0) {
      return { processed: false, reason: "empty_message" };
    }

    await this.clara.handleIncomingWhatsAppMessage({
      messageId: data.key.id,
      phone,
      fromName: data.pushName ?? contact.name,
      fromEmail: contact.email,
      actorUserId: contact.userId,
      actorRole: contact.role,
      investorUserId: contact.role === "investor" ? contact.userId : null,
      startupId: contact.startupId,
      bodyText,
      attachments,
      providerMetadata: payload as unknown as Record<string, unknown>,
    });

    return { processed: true };
  }

  private isMessagesUpsertEvent(event: string): boolean {
    return event.toLowerCase().replace(/[_-]/g, ".") === "messages.upsert";
  }

  private extractText(message: Record<string, unknown>): string | null {
    const conversation = message.conversation;
    if (typeof conversation === "string" && conversation.trim()) {
      return conversation.trim();
    }

    const extended = message.extendedTextMessage;
    if (extended && typeof extended === "object" && "text" in extended) {
      const text = (extended as { text?: unknown }).text;
      if (typeof text === "string" && text.trim()) return text.trim();
    }

    const image = message.imageMessage;
    if (image && typeof image === "object" && "caption" in image) {
      const caption = (image as { caption?: unknown }).caption;
      if (typeof caption === "string" && caption.trim()) return caption.trim();
    }

    const document = message.documentMessage;
    if (document && typeof document === "object" && "caption" in document) {
      const caption = (document as { caption?: unknown }).caption;
      if (typeof caption === "string" && caption.trim()) return caption.trim();
    }

    return null;
  }
}
