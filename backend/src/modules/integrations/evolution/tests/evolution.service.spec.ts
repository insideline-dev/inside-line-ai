import { beforeEach, describe, expect, it, mock } from "bun:test";
import { EvolutionService } from "../evolution.service";

describe("EvolutionService", () => {
  const clara = {
    handleIncomingWhatsAppMessage: mock(async () => undefined),
  };
  const contacts = {
    resolveByPhone: mock(async () => ({
      phone: "+15551234567",
      email: "founder@example.com",
      name: "Founder",
      userId: "user-1",
      role: "founder",
      startupId: "startup-1",
    })),
  };

  const linking = {
    handleUnknownContact: mock(async () => ({ processed: true, reason: "link_email_requested" })),
  };

  const media = {
    extractInboundMedia: mock(async () => ({ attachments: [], transcriptText: null })),
  };

  let service: EvolutionService;

  beforeEach(() => {
    clara.handleIncomingWhatsAppMessage.mockClear();
    contacts.resolveByPhone.mockClear();
    linking.handleUnknownContact.mockClear();
    media.extractInboundMedia.mockClear();
    service = new EvolutionService(clara as never, contacts as never, linking as never, media as never);
  });

  it("normalizes inbound text webhook into Clara WhatsApp message", async () => {
    const result = await service.handleWebhook({
      event: "MESSAGES_UPSERT",
      instance: "clara",
      data: {
        key: {
          id: "msg-1",
          remoteJid: "15551234567@s.whatsapp.net",
          fromMe: false,
        },
        pushName: "Founder",
        message: { conversation: "hello clara" },
      },
    });

    expect(result).toEqual({ processed: true });
    const call = clara.handleIncomingWhatsAppMessage.mock.calls[0]?.[0];
    expect(call).toMatchObject({
      messageId: "msg-1",
      phone: "+15551234567",
      fromName: "Founder",
      fromEmail: "founder@example.com",
      actorUserId: "user-1",
      actorRole: "founder",
      investorUserId: null,
      startupId: "startup-1",
      bodyText: "hello clara",
      attachments: [],
    });
    expect(call.providerMetadata).toBeDefined();
  });

  it("accepts Evolution lowercase dotted messages upsert events", async () => {
    const result = await service.handleWebhook({
      event: "messages.upsert",
      instance: "Clara",
      data: {
        key: {
          id: "msg-lowercase-1",
          remoteJid: "212682860421@s.whatsapp.net",
          fromMe: false,
        },
        pushName: "Yusuf",
        message: { conversation: "Hi" },
      },
    });

    expect(result).toEqual({ processed: true });
    expect(clara.handleIncomingWhatsAppMessage).toHaveBeenCalled();
  });

  it("skips fromMe and group messages", async () => {
    const fromMe = await service.handleWebhook({
      event: "MESSAGES_UPSERT",
      instance: "clara",
      data: {
        key: { id: "msg-1", remoteJid: "15551234567@s.whatsapp.net", fromMe: true },
      },
    });
    const group = await service.handleWebhook({
      event: "MESSAGES_UPSERT",
      instance: "clara",
      data: {
        key: { id: "msg-2", remoteJid: "12345@g.us", fromMe: false },
      },
    });

    expect(fromMe).toEqual({ processed: false, reason: "from_me" });
    expect(group).toEqual({ processed: false, reason: "group_message" });
    expect(clara.handleIncomingWhatsAppMessage).not.toHaveBeenCalled();
  });

  it("routes linked investor phones to Clara without restarting verification", async () => {
    contacts.resolveByPhone.mockResolvedValueOnce({
      phone: "+15551234567",
      email: "investor@example.com",
      name: "Investor",
      userId: "investor-1",
      role: "investor",
      startupId: null,
    });

    const result = await service.handleWebhook({
      event: "messages.upsert",
      instance: "clara",
      data: {
        key: {
          id: "msg-investor-1",
          remoteJid: "15551234567@s.whatsapp.net",
          fromMe: false,
        },
        pushName: "Investor",
        message: { conversation: "show me my deals" },
      },
    });

    expect(result).toEqual({ processed: true });
    expect(linking.handleUnknownContact).not.toHaveBeenCalled();
    expect(clara.handleIncomingWhatsAppMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        fromEmail: "investor@example.com",
        actorUserId: "investor-1",
        actorRole: "investor",
        investorUserId: "investor-1",
        startupId: null,
        bodyText: "show me my deals",
      }),
    );
  });

  it("starts linking flow for unknown contacts", async () => {
    contacts.resolveByPhone.mockResolvedValueOnce(null);

    const result = await service.handleWebhook({
      event: "MESSAGES_UPSERT",
      instance: "clara",
      data: {
        key: {
          id: "msg-1",
          remoteJid: "15551234567@s.whatsapp.net",
          fromMe: false,
        },
        message: { conversation: "hello" },
      },
    });

    expect(result).toEqual({ processed: true, reason: "link_email_requested" });
    expect(linking.handleUnknownContact).toHaveBeenCalledWith({
      phone: "+15551234567",
      text: "hello",
    });
    expect(clara.handleIncomingWhatsAppMessage).not.toHaveBeenCalled();
  });

  it("links a verification code without sending the code message to Clara", async () => {
    contacts.resolveByPhone.mockResolvedValueOnce(null);
    linking.handleUnknownContact.mockResolvedValueOnce({
      processed: true,
      reason: "linked_contact",
    });

    const result = await service.handleWebhook({
      event: "messages.upsert",
      instance: "clara",
      data: {
        key: {
          id: "msg-code-1",
          remoteJid: "15551234567@s.whatsapp.net",
          fromMe: false,
        },
        pushName: "Founder",
        message: { conversation: "123456" },
      },
    });

    expect(result).toEqual({ processed: true, reason: "linked_contact" });
    expect(clara.handleIncomingWhatsAppMessage).not.toHaveBeenCalled();
  });

  it("passes audio-only inbound messages to Clara with transcript and attachments", async () => {
    media.extractInboundMedia.mockResolvedValueOnce({
      transcriptText: "founder voice note transcript",
      attachments: [
        {
          filename: "voice.ogg",
          contentType: "audio/ogg",
          attachmentId: "msg-2:audio:0",
          storagePath: "user-1/audio/voice.ogg",
          assetId: "asset-2",
          isPitchDeck: false,
          status: "uploaded",
        },
      ],
    });

    const result = await service.handleWebhook({
      event: "MESSAGES_UPSERT",
      instance: "clara",
      data: {
        key: {
          id: "msg-2",
          remoteJid: "15551234567@s.whatsapp.net",
          fromMe: false,
        },
        message: { audioMessage: { mimetype: "audio/ogg" } },
      },
    });

    expect(result).toEqual({ processed: true });
    const call = clara.handleIncomingWhatsAppMessage.mock.calls[0]?.[0];
    expect(call.bodyText).toBe("founder voice note transcript");
    expect(call.attachments).toHaveLength(1);
    expect(call.attachments[0]?.contentType).toBe("audio/ogg");
  });
});
