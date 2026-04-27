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

  it("stores nested inbound image messages as Clara attachment metadata", async () => {
    apiClient.getMediaBase64.mockResolvedValueOnce({
      base64: Buffer.from("image-content").toString("base64"),
      mimetype: "image/jpeg",
    });

    const result = await service.extractInboundMedia(
      {
        event: "MESSAGES_UPSERT",
        instance: "clara",
        data: {
          key: { id: "msg-image", remoteJid: "15551234567@s.whatsapp.net" },
          message: {
            messageType: "imageMessage",
            message: {
              imageMessage: {
                mimetype: "image/jpeg",
                caption: "deck screenshot",
              },
            },
          },
        },
      },
      "user-1",
    );

    expect(result.attachments).toHaveLength(1);
    expect(assetService.uploadAndTrack).toHaveBeenCalledWith(
      "user-1",
      "images",
      Buffer.from("image-content"),
      "image/jpeg",
      undefined,
      expect.objectContaining({ source: "evolution" }),
    );
    expect(result.attachments[0]).toMatchObject({
      contentType: "image/jpeg",
      status: "uploaded",
    });
  });

  it("strips Evolution data URI prefixes before storing media", async () => {
    apiClient.getMediaBase64.mockResolvedValueOnce({
      base64: `data:application/pdf;base64,${Buffer.from("pdf-content").toString("base64")}`,
      mimetype: "application/pdf",
    });

    await service.extractInboundMedia(
      {
        event: "MESSAGES_UPSERT",
        instance: "clara",
        data: {
          key: { id: "msg-data-uri", remoteJid: "15551234567@s.whatsapp.net" },
          message: {
            documentMessage: {
              mimetype: "application/pdf",
              fileName: "deck.pdf",
            },
          },
        },
      },
      "user-1",
    );

    expect(assetService.uploadAndTrack.mock.calls[0]?.[2]).toEqual(Buffer.from("pdf-content"));
  });

  it("uses Evolution returned audio mimetype for converted audio files", async () => {
    apiClient.getMediaBase64.mockResolvedValueOnce({
      base64: Buffer.from("audio-content").toString("base64"),
      mimetype: "audio/mp4",
    });

    const result = await service.extractInboundMedia(
      {
        event: "MESSAGES_UPSERT",
        instance: "clara",
        data: {
          key: { id: "msg-audio", remoteJid: "15551234567@s.whatsapp.net" },
          message: {
            audioMessage: {
              mimetype: "audio/ogg; codecs=opus",
            },
          },
        },
      },
      "user-1",
    );

    expect(apiClient.getMediaBase64).toHaveBeenCalledWith(
      expect.anything(),
      { convertToMp4: true },
    );
    expect(assetService.uploadAndTrack.mock.calls[0]?.[3]).toBe("audio/mp4");
    expect(result.attachments[0]).toMatchObject({
      filename: "audio-msg-audio-0.mp4",
      contentType: "audio/mp4",
      status: "uploaded",
    });
  });
});
