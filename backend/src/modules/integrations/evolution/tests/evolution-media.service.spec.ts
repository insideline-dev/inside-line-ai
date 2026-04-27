import { beforeEach, describe, expect, it, mock } from "bun:test";
import { EvolutionMediaService } from "../evolution-media.service";

describe("EvolutionMediaService", () => {
  const apiClient = {
    getMediaBase64: mock(async () => ({
      base64: Buffer.from("file-content").toString("base64"),
      mimetype: "application/pdf",
    })),
  };
  const assetService = {
    uploadAndTrack: mock(async () => ({ id: "asset-1", key: "system/documents/file.pdf" })),
  };
  const config = { get: mock(() => undefined) };

  let service: EvolutionMediaService;

  beforeEach(() => {
    apiClient.getMediaBase64.mockClear();
    assetService.uploadAndTrack.mockClear();
    config.get.mockClear();
    service = new EvolutionMediaService(apiClient as never, assetService as never, config as never);
  });

  it("stores inbound document media as Clara attachment metadata", async () => {
    const result = await service.extractInboundMedia(
      {
        event: "MESSAGES_UPSERT",
        instance: "clara",
        data: {
          key: { id: "msg-1", remoteJid: "15551234567@s.whatsapp.net" },
          message: {
            documentMessage: {
              mimetype: "application/pdf",
              fileName: "pitch-deck.pdf",
            },
          },
        },
      },
      "user-1",
    );

    expect(result.transcriptText).toBeNull();
    expect(result.attachments).toHaveLength(1);
    expect(result.attachments[0]).toMatchObject({
      filename: "pitch-deck.pdf",
      contentType: "application/pdf",
      storagePath: "system/documents/file.pdf",
      assetId: "asset-1",
      status: "uploaded",
      isPitchDeck: true,
    });
  });
});
