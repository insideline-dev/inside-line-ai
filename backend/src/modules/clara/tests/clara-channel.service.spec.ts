import { beforeEach, describe, expect, it, mock } from "bun:test";
import { ClaraChannelService } from "../clara-channel.service";

describe("ClaraChannelService", () => {
  const agentMail = {
    getMessage: mock(async () => undefined),
    replyToMessage: mock(async () => undefined),
    sendMessage: mock(async () => undefined),
  };
  const evolution = {
    sendText: mock(async () => ({ status: "ok" })),
    sendMedia: mock(async () => ({ status: "ok" })),
    sendAudio: mock(async () => ({ status: "ok" })),
  };

  let service: ClaraChannelService;

  beforeEach(() => {
    agentMail.replyToMessage.mockClear();
    evolution.sendText.mockClear();
    evolution.sendMedia.mockClear();
    evolution.sendAudio.mockClear();
    service = new ClaraChannelService(agentMail as never, evolution as never);
  });

  it("sends WhatsApp document attachments through Evolution media endpoint", async () => {
    await service.reply({
      channel: "whatsapp",
      whatsapp: { to: "+15551234567" },
      text: "Attached report",
      attachments: [
        {
          filename: "report.pdf",
          contentType: "application/pdf",
          content: Buffer.from("pdf").toString("base64"),
        },
      ],
    });

    expect(evolution.sendMedia).toHaveBeenCalledWith({
      to: "+15551234567",
      media: Buffer.from("pdf").toString("base64"),
      fileName: "report.pdf",
      mimeType: "application/pdf",
      caption: "Attached report",
    });
  });
});
